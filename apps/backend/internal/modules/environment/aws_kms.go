package environment

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	awskms "github.com/aws/aws-sdk-go-v2/service/kms"
	awskmstypes "github.com/aws/aws-sdk-go-v2/service/kms/types"
)

const (
	awsKMSProviderID                 = "aws.kms/v2"
	maximumAWSKMSWrappedDataKeyBytes = 4096
	maximumAWSKMSOperationTimeout    = 30 * time.Second
)

var (
	awsKMSRegionPattern = regexp.MustCompile(`^[a-z]{2}-[a-z0-9-]+-[0-9]+$`)
	awsKMSKeyARNPattern = regexp.MustCompile(`^arn:(aws|aws-us-gov|aws-cn):kms:([a-z]{2}-[a-z0-9-]+-[0-9]+):([0-9]{12}):key/([A-Za-z0-9-]{1,128})$`)
)

type awsKMSClient interface {
	Encrypt(ctx context.Context, params *awskms.EncryptInput, optFns ...func(*awskms.Options)) (*awskms.EncryptOutput, error)
	Decrypt(ctx context.Context, params *awskms.DecryptInput, optFns ...func(*awskms.Options)) (*awskms.DecryptOutput, error)
}

type awsKMS struct {
	activeKeyID      string
	keyARNs          map[string]string
	client           awsKMSClient
	operationTimeout time.Duration
}

func newAWSKMS(activeKeyID string, keyARNs map[string]string, client awsKMSClient, operationTimeout time.Duration) (*awsKMS, error) {
	if client == nil || operationTimeout <= 0 || operationTimeout > maximumAWSKMSOperationTimeout || len(keyARNs) == 0 || len(keyARNs) > maximumEnvironmentSecretKeyCount {
		return nil, ErrUnavailable
	}
	if normalized, ok := canonical(activeKeyID); !ok || normalized != activeKeyID {
		return nil, errors.New("environment Secret AWS KMS active key id is invalid")
	}
	keyIDs := make([]string, 0, len(keyARNs))
	for keyID := range keyARNs {
		keyIDs = append(keyIDs, keyID)
	}
	sort.Strings(keyIDs)
	normalizedARNs := make(map[string]string, len(keyARNs))
	for _, keyID := range keyIDs {
		if normalized, ok := canonical(keyID); !ok || normalized != keyID || !awsKMSKeyARNPattern.MatchString(keyARNs[keyID]) {
			return nil, errors.New("environment Secret AWS KMS key reference is invalid")
		}
		normalizedARNs[keyID] = keyARNs[keyID]
	}
	if _, ok := normalizedARNs[activeKeyID]; !ok {
		return nil, errors.New("environment Secret active AWS KMS key is not configured")
	}
	return &awsKMS{
		activeKeyID:      activeKeyID,
		keyARNs:          normalizedARNs,
		client:           client,
		operationTimeout: operationTimeout,
	}, nil
}

func validateAWSKMSRegion(region string, keyARNs map[string]string) error {
	if !awsKMSRegionPattern.MatchString(region) || len(keyARNs) == 0 {
		return errors.New("environment Secret AWS KMS region is invalid")
	}
	for _, keyARN := range keyARNs {
		matches := awsKMSKeyARNPattern.FindStringSubmatch(keyARN)
		if len(matches) != 5 || matches[2] != region {
			return errors.New("environment Secret AWS KMS key ARN region does not match the client region")
		}
	}
	return nil
}

func stableAWSKMSKeyIdentity(keyARN string) (string, bool) {
	matches := awsKMSKeyARNPattern.FindStringSubmatch(keyARN)
	if len(matches) != 5 {
		return "", false
	}
	if len(matches[4]) > 4 && matches[4][:4] == "mrk-" {
		return fmt.Sprintf("arn:%s:kms:*:%s:key/%s", matches[1], matches[3], matches[4]), true
	}
	return keyARN, true
}

func validateAWSKMSMultiRegionReplicaPair(primaryKeyARN string, replicaKeyARN string) error {
	primaryMatches := awsKMSKeyARNPattern.FindStringSubmatch(primaryKeyARN)
	replicaMatches := awsKMSKeyARNPattern.FindStringSubmatch(replicaKeyARN)
	primaryIdentity, primaryOK := stableAWSKMSKeyIdentity(primaryKeyARN)
	replicaIdentity, replicaOK := stableAWSKMSKeyIdentity(replicaKeyARN)
	if !primaryOK || !replicaOK || len(primaryMatches) != 5 || len(replicaMatches) != 5 ||
		len(primaryMatches[4]) <= 4 || primaryMatches[4][:4] != "mrk-" ||
		len(replicaMatches[4]) <= 4 || replicaMatches[4][:4] != "mrk-" ||
		primaryMatches[2] == replicaMatches[2] || primaryIdentity != replicaIdentity {
		return errors.New("environment Secret AWS KMS keys are not related multi-Region replicas")
	}
	return nil
}

func (kms *awsKMS) ProviderID() string {
	return awsKMSProviderID
}

func (kms *awsKMS) ActiveKeyID() string {
	if kms == nil {
		return ""
	}
	return kms.activeKeyID
}

func awsKMSEncryptionContext(additionalData []byte) map[string]string {
	digest := sha256.Sum256(additionalData)
	return map[string]string{
		"prodivix-aad-sha256": hex.EncodeToString(digest[:]),
		"prodivix-purpose":    "environment-secret-data-key-v2",
	}
}

func awsKMSWrappedKeyMetadata(keyID string, keyARN string, ciphertext []byte, additionalData []byte) []byte {
	stableIdentity, ok := stableAWSKMSKeyIdentity(keyARN)
	if !ok {
		return nil
	}
	digest := sha256.New()
	_, _ = digest.Write([]byte("prodivix.environment-secret.aws-kms-wrapped-key.v2"))
	_, _ = digest.Write([]byte{0})
	_, _ = digest.Write([]byte(keyID))
	_, _ = digest.Write([]byte{0})
	_, _ = digest.Write([]byte(stableIdentity))
	_, _ = digest.Write([]byte{0})
	_, _ = digest.Write(ciphertext)
	_, _ = digest.Write([]byte{0})
	aadDigest := sha256.Sum256(additionalData)
	_, _ = digest.Write(aadDigest[:])
	return digest.Sum(nil)
}

func (kms *awsKMS) operationContext(ctx context.Context) (context.Context, context.CancelFunc, error) {
	if kms == nil || kms.client == nil || ctx == nil || kms.operationTimeout <= 0 || kms.operationTimeout > maximumAWSKMSOperationTimeout {
		return nil, nil, ErrUnavailable
	}
	operationContext, cancel := context.WithTimeout(ctx, kms.operationTimeout)
	return operationContext, cancel, nil
}

func (kms *awsKMS) WrapDataKey(ctx context.Context, dataKey []byte, additionalData []byte) (string, []byte, []byte, error) {
	if kms == nil || len(dataKey) != 32 || len(additionalData) == 0 || len(additionalData) > 4096 {
		return "", nil, nil, ErrUnavailable
	}
	keyARN := kms.keyARNs[kms.activeKeyID]
	if keyARN == "" {
		return "", nil, nil, ErrUnavailable
	}
	operationContext, cancel, err := kms.operationContext(ctx)
	if err != nil {
		return "", nil, nil, err
	}
	defer cancel()
	plaintext := append([]byte(nil), dataKey...)
	defer clearBytes(plaintext)
	output, err := kms.client.Encrypt(operationContext, &awskms.EncryptInput{
		KeyId:               aws.String(keyARN),
		Plaintext:           plaintext,
		EncryptionAlgorithm: awskmstypes.EncryptionAlgorithmSpecSymmetricDefault,
		EncryptionContext:   awsKMSEncryptionContext(additionalData),
	})
	if err != nil {
		if operationContext.Err() != nil {
			return "", nil, nil, operationContext.Err()
		}
		return "", nil, nil, fmt.Errorf("%w: AWS KMS encrypt failed", ErrUnavailable)
	}
	if output == nil || aws.ToString(output.KeyId) != keyARN || output.EncryptionAlgorithm != awskmstypes.EncryptionAlgorithmSpecSymmetricDefault || len(output.CiphertextBlob) < 33 || len(output.CiphertextBlob) > maximumAWSKMSWrappedDataKeyBytes {
		return "", nil, nil, ErrPermissionDenied
	}
	ciphertext := append([]byte(nil), output.CiphertextBlob...)
	return kms.activeKeyID, awsKMSWrappedKeyMetadata(kms.activeKeyID, keyARN, ciphertext, additionalData), ciphertext, nil
}

func (kms *awsKMS) UnwrapDataKey(ctx context.Context, keyID string, metadata []byte, ciphertext []byte, additionalData []byte) ([]byte, error) {
	if kms == nil || len(metadata) != sha256.Size || len(ciphertext) < 33 || len(ciphertext) > maximumAWSKMSWrappedDataKeyBytes || len(additionalData) == 0 || len(additionalData) > 4096 {
		return nil, ErrPermissionDenied
	}
	keyARN := kms.keyARNs[keyID]
	if keyARN == "" || subtle.ConstantTimeCompare(metadata, awsKMSWrappedKeyMetadata(keyID, keyARN, ciphertext, additionalData)) != 1 {
		return nil, ErrPermissionDenied
	}
	operationContext, cancel, err := kms.operationContext(ctx)
	if err != nil {
		return nil, err
	}
	defer cancel()
	output, err := kms.client.Decrypt(operationContext, &awskms.DecryptInput{
		KeyId:               aws.String(keyARN),
		CiphertextBlob:      append([]byte(nil), ciphertext...),
		EncryptionAlgorithm: awskmstypes.EncryptionAlgorithmSpecSymmetricDefault,
		EncryptionContext:   awsKMSEncryptionContext(additionalData),
	})
	if err != nil {
		if output != nil {
			clearBytes(output.Plaintext)
		}
		if operationContext.Err() != nil {
			return nil, operationContext.Err()
		}
		return nil, ErrPermissionDenied
	}
	if output == nil || aws.ToString(output.KeyId) != keyARN || output.EncryptionAlgorithm != awskmstypes.EncryptionAlgorithmSpecSymmetricDefault || len(output.Plaintext) != 32 || len(output.CiphertextForRecipient) != 0 {
		if output != nil {
			clearBytes(output.Plaintext)
		}
		return nil, ErrPermissionDenied
	}
	return output.Plaintext, nil
}

// NewStoreWithAWSKMS loads the standard AWS credential chain and keeps all KMS
// cryptographic operations behind the Environment store envelope boundary.
func NewStoreWithAWSKMS(ctx context.Context, db *sql.DB, encodedLegacyMasterKey string, region string, activeKeyID string, keyARNs map[string]string, legacyStaticKeys map[string]string, operationTimeout time.Duration) (*Store, error) {
	if ctx == nil {
		return nil, ErrUnavailable
	}
	if err := validateAWSKMSRegion(region, keyARNs); err != nil {
		return nil, err
	}
	awsConfiguration, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("load AWS KMS configuration: %w", err)
	}
	kms, err := newAWSKMS(activeKeyID, keyARNs, awskms.NewFromConfig(awsConfiguration), operationTimeout)
	if err != nil {
		return nil, err
	}
	decryptOnlyKMS := make([]secretKeyManagementService, 0, 1)
	if len(legacyStaticKeys) > 0 {
		keyIDs := make([]string, 0, len(legacyStaticKeys))
		for keyID := range legacyStaticKeys {
			keyIDs = append(keyIDs, keyID)
		}
		sort.Strings(keyIDs)
		legacyKMS, err := newStaticKeyRingKMS(keyIDs[0], legacyStaticKeys)
		if err != nil {
			return nil, fmt.Errorf("initialize decrypt-only static KMS migration adapter: %w", err)
		}
		decryptOnlyKMS = append(decryptOnlyKMS, legacyKMS)
	}
	return newStoreWithKMS(db, encodedLegacyMasterKey, kms, nil, decryptOnlyKMS...), nil
}
