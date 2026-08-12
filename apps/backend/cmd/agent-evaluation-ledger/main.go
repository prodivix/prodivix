package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"syscall"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/modules/agent"
	backendverification "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	backenddatabase "github.com/Prodivix/prodivix/apps/backend/internal/platform/database"
	_ "github.com/jackc/pgx/v5/stdlib"
)

const (
	databaseURLEnvironment                                          = "PRODIVIX_G4_MODEL_EVAL_DATABASE_URL"
	serviceTokenEnvironment                                         = "PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN"
	namespaceEnvironment                                            = "PRODIVIX_G4_MODEL_EVAL_NAMESPACE"
	listenAddressEnvironment                                        = "PRODIVIX_G4_MODEL_EVAL_LEDGER_LISTEN_ADDRESS"
	trustedPublicKeysEnvironment                                    = "PRODIVIX_G4_MODEL_EVAL_TRUSTED_PUBLIC_KEYS"
	ownerAuthorityURLEnvironment                                    = "PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_BASE_URL"
	ownerAuthorityTokenEnvironment                                  = "PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_SERVICE_TOKEN"
	ownerAuthorityPurposeEnvironment                                = "PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_PURPOSE"
	repositoryCommitEnvironment                                     = "PRODIVIX_G4_MODEL_EVAL_REPOSITORY_COMMIT"
	commitmentPathEnvironment                                       = "PRODIVIX_G4_MODEL_EVAL_FROZEN_CONFIG_COMMITMENT_PATH"
	holdoutDirectoryEnvironment                                     = "PRODIVIX_G4_MODEL_EVAL_HOLDOUT_DIRECTORY"
	secretCanariesEnvironment                                       = "PRODIVIX_G4_MODEL_EVAL_SECRET_CANARIES"
	protectedCanariesEnvironment                                    = "PRODIVIX_G4_MODEL_EVAL_PROTECTED_HOLDOUT_CANARIES"
	workflowRunIDEnvironment                                        = "PRODIVIX_G4_MODEL_EVAL_WORKFLOW_RUN_ID"
	workflowAttemptEnvironment                                      = "PRODIVIX_G4_MODEL_EVAL_WORKFLOW_RUN_ATTEMPT"
	workflowJobEnvironment                                          = "PRODIVIX_G4_MODEL_EVAL_WORKFLOW_JOB_ID"
	environmentDigestEnvironment                                    = "PRODIVIX_G4_MODEL_EVAL_ENVIRONMENT_DIGEST"
	attestationAuthorityEnvironment                                 = "PRODIVIX_G4_MODEL_EVAL_ATTESTATION_AUTHORITY_ID"
	attestationKeyIDEnvironment                                     = "PRODIVIX_G4_MODEL_EVAL_ATTESTATION_KEY_ID"
	nativeProviderStateVaultKeyEnvironment                          = "PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_KEY_BASE64"
	nativeProviderStateVaultOwnerInstanceEnvironment                = "PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_OWNER_INSTANCE_ID"
	nativeProviderStateVaultRecoveryOnlyEnvironment                 = "PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_RECOVERY_ONLY"
	capabilityEffectProviderJournalOwnerEnvironment                 = "PRODIVIX_G4_MODEL_EVAL_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ID"
	hostedRetrievalRuntimeResourceRoleEnvironment                   = "PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE"
	hostedRetrievalRuntimeResourceLifecycleOwnerInstanceEnvironment = "PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_INSTANCE_ID"
	defaultListenAddress                                            = "127.0.0.1:8790"
	maximumTrustRegistryBytes                                       = 65_536
	maximumHoldoutCanaryBytes                                       = 2_900_000
)

var trustKeyIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$`)

type trustedPublicKeyConfiguration struct {
	KeyID              string `json:"keyId"`
	PublicKeyBase64URL string `json:"publicKeyBase64Url"`
}

func main() {
	databaseURL := os.Getenv(databaseURLEnvironment)
	serviceToken := os.Getenv(serviceTokenEnvironment)
	namespaceID := os.Getenv(namespaceEnvironment)
	listenAddress := os.Getenv(listenAddressEnvironment)
	if listenAddress == "" {
		listenAddress = defaultListenAddress
	}
	if databaseURL == "" || serviceToken == "" || namespaceID == "" || !isLoopbackAddress(listenAddress) {
		log.Fatal("evaluation ledger configuration is invalid")
	}

	database, err := sql.Open("pgx", databaseURL)
	if err != nil {
		log.Fatal("evaluation ledger database could not be opened")
	}
	defer func() { _ = database.Close() }()
	database.SetMaxOpenConns(20)
	database.SetMaxIdleConns(10)
	database.SetConnMaxLifetime(30 * time.Minute)

	startupContext, cancelStartup := context.WithTimeout(context.Background(), 2*time.Minute)
	if err := database.PingContext(startupContext); err != nil {
		cancelStartup()
		log.Fatal("evaluation ledger database is unavailable")
	}
	if err := backenddatabase.RunMigrations(startupContext, database, 90*time.Second); err != nil {
		cancelStartup()
		log.Fatal("evaluation ledger migrations failed")
	}
	cancelStartup()

	trustRegistry := os.Getenv(trustedPublicKeysEnvironment)
	var verifier agent.EvaluationAuthorityAttestationVerifier
	if trustRegistry != "" {
		verifier, err = trustedAttestationVerifier(trustRegistry)
		if err != nil {
			log.Fatal("evaluation ledger trusted key registry is invalid")
		}
	}
	ownerComposition, err := evaluationOwnerAuthorityComposition(os.Getenv, serviceToken)
	if err != nil {
		log.Fatal("evaluation owner authority configuration is invalid")
	}
	recoveryOnlySource := os.Getenv(nativeProviderStateVaultRecoveryOnlyEnvironment)
	nativeProviderStateVaultRecoveryOnly, err := decodeNativeProviderStateVaultRecoveryOnly(recoveryOnlySource)
	if err != nil {
		log.Fatal("evaluation native Provider state vault recovery mode is invalid")
	}
	if nativeProviderStateVaultRecoveryOnly && (ownerComposition.verifyOwner != nil || ownerComposition.ownerPurpose != "") {
		log.Fatal("evaluation native Provider state vault recovery mode cannot compose a runner owner")
	}
	hostedRetrievalRuntimeResourceRole, err := evaluationHostedRetrievalRuntimeResourceRole(
		os.Getenv, ownerComposition.ownerPurpose, nativeProviderStateVaultRecoveryOnly,
	)
	if err != nil {
		log.Fatal("evaluation hosted retrieval runtime resource role is invalid")
	}
	repository := agent.NewRepository(database)
	hostedRetrievalRuntimeResourceRequired := hostedRetrievalRuntimeResourceRole != ""
	hostedRetrievalRuntimeResourceLifecycleOwnerInstanceID, err := evaluationHostedRetrievalRuntimeResourceLifecycleOwnerInstanceID(
		os.Getenv, hostedRetrievalRuntimeResourceRole,
	)
	if err != nil {
		log.Fatal("evaluation hosted retrieval runtime resource lifecycle owner configuration is invalid")
	}
	var hostedRetrievalRuntimeResource *agent.EvaluationHostedRetrievalRuntimeResource
	if hostedRetrievalRuntimeResourceRequired {
		hostedRetrievalRuntimeResource, err = agent.NewEvaluationHostedRetrievalRuntimeResource(
			agent.EvaluationHostedRetrievalRuntimeResourceConfig{
				Repository:               repository,
				LifecycleOwnerInstanceID: hostedRetrievalRuntimeResourceLifecycleOwnerInstanceID,
			},
		)
		if err != nil {
			log.Fatal("evaluation hosted retrieval runtime resource owner could not be initialized")
		}
	}
	capabilityEffectProviderJournalRequired := ownerComposition.ownerPurpose == "preplan" ||
		ownerComposition.ownerPurpose == "full-attempt" || nativeProviderStateVaultRecoveryOnly
	capabilityEffectProviderJournalOwnerInstanceID, err := evaluationCapabilityEffectProviderJournalOwnerInstanceID(
		os.Getenv, capabilityEffectProviderJournalRequired,
	)
	if err != nil {
		log.Fatal("evaluation capability-effect Provider journal configuration is invalid")
	}
	var capabilityEffectProviderJournal *agent.EvaluationCapabilityEffectProviderJournal
	if capabilityEffectProviderJournalRequired {
		capabilityEffectProviderJournal, err = agent.NewEvaluationCapabilityEffectProviderJournal(
			agent.EvaluationCapabilityEffectProviderJournalConfig{
				Repository: repository, OwnerInstanceID: capabilityEffectProviderJournalOwnerInstanceID,
			},
		)
		if err != nil {
			log.Fatal("evaluation capability-effect Provider journal could not be initialized")
		}
	}
	runConfigArtifactSource, err := agent.NewRepositoryEvaluationProductionRunConfigArtifactSource(repository, namespaceID)
	if err != nil {
		log.Fatal("evaluation production run-config artifact source configuration is invalid")
	}
	var nativeProviderStateVault *agent.EvaluationNativeProviderStateVault
	nativeProviderStateVaultKeySource := os.Getenv(nativeProviderStateVaultKeyEnvironment)
	nativeProviderStateVaultOwnerInstanceID := os.Getenv(nativeProviderStateVaultOwnerInstanceEnvironment)
	if (nativeProviderStateVaultKeySource == "") != (nativeProviderStateVaultOwnerInstanceID == "") {
		log.Fatal("evaluation native Provider state vault configuration is partial")
	}
	if nativeProviderStateVaultRecoveryOnly && nativeProviderStateVaultKeySource == "" {
		log.Fatal("evaluation native Provider state vault recovery configuration is incomplete")
	}
	if nativeProviderStateVaultKeySource != "" {
		nativeProviderStateVaultKey, keyErr := decodeNativeProviderStateVaultKey(nativeProviderStateVaultKeySource)
		if keyErr != nil {
			log.Fatal("evaluation native Provider state vault key configuration is invalid")
		}
		if nativeProviderStateVaultRecoveryOnly {
			nativeProviderStateVault, err = agent.NewRepositoryEvaluationNativeProviderStateVaultRecovery(
				repository, nativeProviderStateVaultKey, nativeProviderStateVaultOwnerInstanceID, nil,
			)
		} else if ownerComposition.attemptScanner != nil {
			nativeProviderStateVault, err = agent.NewRepositoryEvaluationNativeProviderStateVault(
				repository, nativeProviderStateVaultKey, nativeProviderStateVaultOwnerInstanceID,
				ownerComposition.attemptScanner, nil,
			)
		} else {
			err = errors.New("native Provider state vault requires the attempt response scanner")
		}
		clear(nativeProviderStateVaultKey)
		if err != nil {
			log.Fatal("evaluation native Provider state vault configuration is invalid")
		}
	}
	var holdoutAuthority agent.EvaluationHoldoutSealAuthority
	var humanReviewAuthority agent.EvaluationHumanReviewAuthority
	if !nativeProviderStateVaultRecoveryOnly {
		holdoutConfigured, err := evaluationHoldoutEnvironmentConfigured(os.Getenv)
		if err != nil {
			log.Fatal("evaluation ledger holdout authority configuration is partial")
		}
		if holdoutConfigured {
			if verifier == nil {
				log.Fatal("evaluation ledger holdout authority requires a trusted key registry")
			}
			if err := validateEnvironmentHoldoutCanaries(os.Getenv); err != nil {
				log.Fatal("evaluation ledger holdout canary configuration is invalid")
			}
			holdoutAuthority, err = environmentHoldoutAuthority(verifier, runConfigArtifactSource)
			if err != nil {
				log.Fatal("evaluation ledger holdout authority configuration is invalid")
			}
		}
		humanReviewConfigured, err := evaluationHumanReviewEnvironmentConfigured(os.Getenv)
		if err != nil {
			log.Fatal("evaluation ledger human review authority configuration is partial")
		}
		if humanReviewConfigured {
			if verifier == nil {
				log.Fatal("evaluation ledger human review authority requires a trusted key registry")
			}
			humanReviewAuthority, err = environmentHumanReviewAuthority(verifier, runConfigArtifactSource)
			if err != nil {
				log.Fatal("evaluation ledger human review authority configuration is invalid")
			}
		}
	}
	handler, err := agent.NewEvaluationServiceHandler(repository, agent.EvaluationServiceHandlerConfig{
		NamespaceID:                                     namespaceID,
		ServiceToken:                                    serviceToken,
		AttestationVerifier:                             verifier,
		VerificationAttemptGrantIssuer:                  backendverification.NewPostgreSQLAttemptGrantAuthority(database),
		ControlledWorkspaceAuthority:                    ownerComposition.controlledAuthority,
		ControlledWorkspaceResponseScanner:              ownerComposition.controlledScanner,
		VerificationEvidenceAuthority:                   ownerComposition.verificationAuthority,
		VerificationEvidenceResponseScanner:             ownerComposition.verificationScanner,
		G3CellAdmissionAuthority:                        ownerComposition.g3CellAdmissionAuthority,
		CapabilityProbeAdmissionAuthority:               ownerComposition.capabilityProbeAdmissionAuthority,
		CapabilityProbeProviderResourceAuthority:        ownerComposition.capabilityProbeProviderResourceAuthority,
		CapabilityProbeProviderResourceCleanupAuthority: ownerComposition.capabilityProbeProviderResourceCleanupAuthority,
		RuntimeFactSourceRegistrationAuthority:          ownerComposition.runtimeFactSourceRegistrationAuthority,
		NativeProviderStateVault:                        nativeProviderStateVault,
		CapabilityEffectProviderJournal:                 capabilityEffectProviderJournal,
		HostedRetrievalRuntimeResource:                  hostedRetrievalRuntimeResource,
		HostedRetrievalRuntimeResourceRole:              hostedRetrievalRuntimeResourceRole,
		AttemptAuthority:                                ownerComposition.attemptAuthority,
		AttemptAuthorityResponseScanner:                 ownerComposition.attemptScanner,
		HoldoutSealAuthority:                            holdoutAuthority,
		HumanReviewAuthority:                            humanReviewAuthority,
		OwnerAuthorityPurpose:                           ownerComposition.ownerPurpose,
		OwnerActivationRequired:                         ownerComposition.verifyOwner != nil,
	})
	if err != nil {
		log.Fatal("evaluation ledger authority configuration is invalid")
	}
	server := &http.Server{
		Addr:              listenAddress,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      3 * time.Minute,
		IdleTimeout:       30 * time.Second,
		MaxHeaderBytes:    32_768,
	}

	listener, err := net.Listen("tcp", listenAddress)
	if err != nil {
		log.Fatal("evaluation ledger listen socket could not be opened")
	}
	serverErrors := make(chan error, 1)
	stopStateVaultSweep := make(chan struct{})
	stateVaultSweepStopped := make(chan struct{})
	if nativeProviderStateVault != nil && !nativeProviderStateVault.RecoveryOnly() {
		go func() {
			defer close(stateVaultSweepStopped)
			ticker := time.NewTicker(time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					sweepContext, cancelSweep := context.WithTimeout(context.Background(), 10*time.Second)
					_, _ = nativeProviderStateVault.SweepNamespace(
						sweepContext, namespaceID, os.Getenv(repositoryCommitEnvironment), false,
					)
					cancelSweep()
				case <-stopStateVaultSweep:
					return
				}
			}
		}()
	} else {
		close(stateVaultSweepStopped)
	}
	go func() { serverErrors <- server.Serve(listener) }()
	ownerActivationErrors := make(chan error, 1)
	if ownerComposition.verifyOwner != nil {
		go func() {
			activationContext, cancelActivation := context.WithTimeout(context.Background(), 2*time.Minute)
			defer cancelActivation()
			ticker := time.NewTicker(250 * time.Millisecond)
			defer ticker.Stop()
			for {
				if err := ownerComposition.verifyOwner(activationContext); err == nil {
					purpose, healthDigest, ok := ownerComposition.ownerHealthBinding()
					if !ok {
						ownerActivationErrors <- errors.New("evaluation owner authority health binding is unavailable")
						return
					}
					if err := handler.ActivateOwnerAuthority(purpose, healthDigest); err != nil {
						ownerActivationErrors <- err
					}
					return
				}
				select {
				case <-activationContext.Done():
					ownerActivationErrors <- activationContext.Err()
					return
				case <-ticker.C:
				}
			}
		}()
	}
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(signals)

	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			log.Fatal("evaluation ledger server failed")
		}
	case <-ownerActivationErrors:
		log.Fatal("evaluation owner authority sidecar activation failed")
	case <-signals:
		close(stopStateVaultSweep)
		<-stateVaultSweepStopped
		if nativeProviderStateVault != nil {
			vaultContext, cancelVault := context.WithTimeout(context.Background(), 25*time.Second)
			vaultErr := nativeProviderStateVault.CloseNamespace(
				vaultContext, namespaceID, os.Getenv(repositoryCommitEnvironment),
			)
			cancelVault()
			if vaultErr != nil {
				log.Fatal("evaluation native Provider state vault shutdown sweep failed")
			}
		}
		shutdownContext, cancelShutdown := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelShutdown()
		if err := server.Shutdown(shutdownContext); err != nil {
			_ = server.Close()
			log.Fatal("evaluation ledger server shutdown failed")
		}
	}
}

func evaluationCapabilityEffectProviderJournalOwnerInstanceID(
	read func(string) string,
	required bool,
) (string, error) {
	if !required {
		return "", nil
	}
	if read == nil {
		return "", errors.New("journal owner environment is unavailable")
	}
	ownerInstanceID := read(capabilityEffectProviderJournalOwnerEnvironment)
	if !agent.ValidEvaluationCapabilityEffectProviderJournalOwnerInstanceID(ownerInstanceID) {
		return "", errors.New("journal owner instance identity is invalid")
	}
	return ownerInstanceID, nil
}

func decodeNativeProviderStateVaultKey(source string) ([]byte, error) {
	decoded, err := base64.StdEncoding.Strict().DecodeString(source)
	if err != nil || len(decoded) != 32 || base64.StdEncoding.EncodeToString(decoded) != source {
		clear(decoded)
		return nil, errors.New("native Provider state vault key is invalid")
	}
	return decoded, nil
}

func decodeNativeProviderStateVaultRecoveryOnly(source string) (bool, error) {
	switch source {
	case "":
		return false, nil
	case "1":
		return true, nil
	default:
		return false, errors.New("native Provider state vault recovery mode is invalid")
	}
}

func evaluationHostedRetrievalRuntimeResourceRole(
	readEnvironment func(string) string,
	ownerPurpose string,
	recoveryOnly bool,
) (string, error) {
	if readEnvironment == nil {
		return "", errors.New("hosted retrieval runtime resource role reader is missing")
	}
	explicit := readEnvironment(hostedRetrievalRuntimeResourceRoleEnvironment)
	if recoveryOnly {
		if explicit != "" || ownerPurpose != "" {
			return "", errors.New("hosted recovery role is ambiguous")
		}
		return "recovery", nil
	}
	if ownerPurpose == "preplan" || ownerPurpose == "full-attempt" {
		if explicit != "" {
			return "", errors.New("hosted runner role must be derived from its owner purpose")
		}
		return ownerPurpose, nil
	}
	if ownerPurpose != "" || (explicit != "" && explicit != "prepare" && explicit != "cleanup" && explicit != "recovery") {
		return "", errors.New("hosted retrieval runtime resource role is invalid")
	}
	return explicit, nil
}

func evaluationHostedRetrievalRuntimeResourceLifecycleOwnerInstanceID(
	readEnvironment func(string) string,
	role string,
) (string, error) {
	required := role == "prepare" || role == "cleanup" || role == "recovery"
	if readEnvironment == nil {
		if required {
			return "", errors.New("hosted lifecycle owner environment is unavailable")
		}
		return "", nil
	}
	ownerInstanceID := readEnvironment(hostedRetrievalRuntimeResourceLifecycleOwnerInstanceEnvironment)
	if !required {
		if ownerInstanceID != "" {
			return "", errors.New("hosted lifecycle owner identity is outside its role")
		}
		return "", nil
	}
	if !agent.ValidEvaluationHostedRetrievalRuntimeResourceLifecycleOwnerInstanceID(ownerInstanceID) {
		return "", errors.New("hosted lifecycle owner identity is invalid")
	}
	return ownerInstanceID, nil
}

type evaluationOwnerAuthorityCompositionResult struct {
	controlledAuthority                             agent.EvaluationControlledWorkspaceAuthority
	verificationAuthority                           agent.EvaluationVerificationEvidenceAuthority
	g3CellAdmissionAuthority                        agent.EvaluationG3CellAdmissionAuthority
	capabilityProbeAdmissionAuthority               agent.EvaluationCapabilityProbeAdmissionAuthority
	capabilityProbeProviderResourceAuthority        agent.EvaluationCapabilityProbeProviderResourceAuthority
	capabilityProbeProviderResourceCleanupAuthority agent.EvaluationCapabilityProbeProviderResourceCleanupAuthority
	runtimeFactSourceRegistrationAuthority          agent.EvaluationRuntimeFactSourceRegistrationAuthority
	attemptAuthority                                agent.EvaluationAttemptAuthority
	controlledScanner                               agent.EvaluationControlledWorkspacePublicResponseScanner
	verificationScanner                             agent.EvaluationVerificationEvidencePublicResponseScanner
	attemptScanner                                  agent.EvaluationAttemptAuthorityPublicResponseScanner
	verifyOwner                                     func(context.Context) error
	ownerHealthBinding                              func() (string, string, bool)
	ownerPurpose                                    string
}

func evaluationOwnerAuthorityComposition(
	readEnvironment func(string) string,
	ledgerServiceToken string,
) (evaluationOwnerAuthorityCompositionResult, error) {
	if readEnvironment == nil {
		return evaluationOwnerAuthorityCompositionResult{}, errors.New("owner authority environment reader is missing")
	}
	ownerURL := readEnvironment(ownerAuthorityURLEnvironment)
	ownerToken := readEnvironment(ownerAuthorityTokenEnvironment)
	ownerPurpose := readEnvironment(ownerAuthorityPurposeEnvironment)
	secretSource := readEnvironment(secretCanariesEnvironment)
	protectedSource := readEnvironment(protectedCanariesEnvironment)
	configured := ownerURL != "" || ownerToken != "" || ownerPurpose != "" || secretSource != "" || protectedSource != ""
	if !configured {
		return evaluationOwnerAuthorityCompositionResult{}, nil
	}
	if ownerURL == "" || ownerToken == "" || ownerPurpose == "" || secretSource == "" || protectedSource == "" {
		return evaluationOwnerAuthorityCompositionResult{}, errors.New("owner authority configuration is partial")
	}
	ledgerCredential, ownerCredential := []byte(ledgerServiceToken), []byte(ownerToken)
	defer clear(ledgerCredential)
	defer clear(ownerCredential)
	if len(ledgerCredential) == len(ownerCredential) &&
		subtle.ConstantTimeCompare(ledgerCredential, ownerCredential) == 1 {
		return evaluationOwnerAuthorityCompositionResult{}, errors.New("owner and ledger credentials must be purpose-bound")
	}
	secretCanaries, secretErr := decodeHoldoutCanaryEnvironment(secretSource)
	protectedCanaries, protectedErr := decodeHoldoutCanaryEnvironment(protectedSource)
	defer func() {
		for _, canary := range secretCanaries {
			clear(canary)
		}
		for _, canary := range protectedCanaries {
			clear(canary)
		}
	}()
	owner, ownerErr := agent.NewEvaluationLoopbackAuthorityClient(agent.EvaluationLoopbackAuthorityConfig{
		BaseURL: ownerURL, ServiceToken: ownerToken, Purpose: ownerPurpose,
	})
	scanner, scannerErr := agent.NewEvaluationPublicResponseScanner(agent.EvaluationPublicResponseScannerConfig{
		CredentialCanaries:        [][]byte{ledgerCredential, ownerCredential},
		SecretCanaries:            secretCanaries,
		ProtectedMaterialCanaries: protectedCanaries,
	})
	if secretErr != nil || protectedErr != nil || ownerErr != nil || scannerErr != nil {
		return evaluationOwnerAuthorityCompositionResult{}, errors.New("owner authority composition is invalid")
	}
	result := evaluationOwnerAuthorityCompositionResult{
		controlledScanner: scanner, verificationScanner: scanner, attemptScanner: scanner,
		verifyOwner: owner.VerifyReady, ownerHealthBinding: owner.OwnerAuthorityHealthBinding,
		ownerPurpose: ownerPurpose,
	}
	if ownerPurpose == "preplan" {
		result.capabilityProbeAdmissionAuthority = owner
		result.capabilityProbeProviderResourceAuthority = owner
		result.capabilityProbeProviderResourceCleanupAuthority = owner
		result.runtimeFactSourceRegistrationAuthority = owner
		return result, nil
	}
	result.controlledAuthority = owner
	result.verificationAuthority = owner
	result.g3CellAdmissionAuthority = owner
	result.attemptAuthority = owner
	return result, nil
}

func holdoutCanaryByte(value byte) bool {
	return (value >= 'a' && value <= 'z') || (value >= 'A' && value <= 'Z') ||
		(value >= '0' && value <= '9') || value == '.' || value == '_' || value == ':' ||
		value == '@' || value == '%' || value == '+' || value == '=' || value == '/' || value == '-'
}

func decodeHoldoutCanaryEnvironment(source string) ([][]byte, error) {
	if source == "" || len(source) > maximumHoldoutCanaryBytes {
		return nil, errors.New("holdout canary environment is missing or too large")
	}
	raw := []byte(source)
	defer clear(raw)
	index := 0
	skipSpace := func() {
		for index < len(raw) && (raw[index] == ' ' || raw[index] == '\t' || raw[index] == '\r' || raw[index] == '\n') {
			index++
		}
	}
	fail := func(values [][]byte) ([][]byte, error) {
		for _, value := range values {
			clear(value)
		}
		return nil, errors.New("holdout canary environment is invalid")
	}
	skipSpace()
	if index >= len(raw) || raw[index] != '[' {
		return fail(nil)
	}
	index++
	values := make([][]byte, 0, 16)
	for {
		skipSpace()
		if index < len(raw) && raw[index] == ']' {
			index++
			break
		}
		if len(values) >= 256 || index >= len(raw) || raw[index] != '"' {
			return fail(values)
		}
		index++
		start := index
		for index < len(raw) && raw[index] != '"' {
			if !holdoutCanaryByte(raw[index]) {
				return fail(values)
			}
			index++
		}
		if index >= len(raw) || index-start < 8 || index-start > 4_096 {
			return fail(values)
		}
		values = append(values, append([]byte(nil), raw[start:index]...))
		index++
		skipSpace()
		if index < len(raw) && raw[index] == ',' {
			index++
			skipSpace()
			if index >= len(raw) || raw[index] == ']' {
				return fail(values)
			}
			continue
		}
		if index < len(raw) && raw[index] == ']' {
			index++
			break
		}
		return fail(values)
	}
	skipSpace()
	if index != len(raw) || len(values) == 0 {
		return fail(values)
	}
	return values, nil
}

func environmentHoldoutCanarySource(ctx context.Context) (agent.EvaluationHoldoutCanarySets, error) {
	if err := ctx.Err(); err != nil {
		return agent.EvaluationHoldoutCanarySets{}, err
	}
	secret, err := decodeHoldoutCanaryEnvironment(os.Getenv(secretCanariesEnvironment))
	if err != nil {
		return agent.EvaluationHoldoutCanarySets{}, err
	}
	protected, err := decodeHoldoutCanaryEnvironment(os.Getenv(protectedCanariesEnvironment))
	if err != nil {
		for _, value := range secret {
			clear(value)
		}
		return agent.EvaluationHoldoutCanarySets{}, err
	}
	return agent.EvaluationHoldoutCanarySets{
		SecretCanaries: secret, ProtectedHoldoutCanaries: protected,
	}, nil
}

var evaluationHoldoutRequiredEnvironmentNames = [...]string{
	repositoryCommitEnvironment,
	commitmentPathEnvironment,
	holdoutDirectoryEnvironment,
	secretCanariesEnvironment,
	protectedCanariesEnvironment,
	workflowRunIDEnvironment,
	workflowAttemptEnvironment,
	workflowJobEnvironment,
	environmentDigestEnvironment,
	attestationAuthorityEnvironment,
	attestationKeyIDEnvironment,
}

// Holdout-only paths opt the process into the production sealing authority.
// Shared trust, repository-commit, provenance and canary variables may also be
// present in review/finalize jobs, so they do not enable the authority alone.
var evaluationHoldoutEnablingEnvironmentNames = [...]string{
	commitmentPathEnvironment,
	holdoutDirectoryEnvironment,
}

var evaluationHumanReviewRequiredEnvironmentNames = [...]string{
	repositoryCommitEnvironment,
}

func evaluationHoldoutEnvironmentConfigured(readEnvironment func(string) string) (bool, error) {
	if readEnvironment == nil {
		return false, errors.New("holdout environment reader is missing")
	}
	configured := false
	for _, name := range evaluationHoldoutEnablingEnvironmentNames {
		configured = configured || readEnvironment(name) != ""
	}
	if !configured {
		return false, nil
	}
	for _, name := range evaluationHoldoutRequiredEnvironmentNames {
		if readEnvironment(name) == "" {
			return false, errors.New("holdout environment is partial")
		}
	}
	return true, nil
}

func evaluationHumanReviewEnvironmentConfigured(readEnvironment func(string) string) (bool, error) {
	if readEnvironment == nil {
		return false, errors.New("human review environment reader is missing")
	}
	if readEnvironment(repositoryCommitEnvironment) == "" {
		return false, nil
	}
	for _, name := range evaluationHumanReviewRequiredEnvironmentNames {
		if readEnvironment(name) == "" {
			return false, errors.New("human review environment is partial")
		}
	}
	return true, nil
}

func environmentHumanReviewAuthority(
	verifier agent.EvaluationAuthorityAttestationVerifier,
	runConfigArtifactSource agent.EvaluationProductionRunConfigArtifactSource,
) (agent.EvaluationHumanReviewAuthority, error) {
	return agent.NewTrackedEvaluationHumanReviewAuthority(agent.EvaluationTrackedHumanReviewAuthorityConfig{
		ExpectedRepositoryCommit: os.Getenv(repositoryCommitEnvironment),
		Verifier:                 verifier, RunConfigArtifactSource: runConfigArtifactSource,
	})
}

func validateEnvironmentHoldoutCanaries(readEnvironment func(string) string) error {
	secret, err := decodeHoldoutCanaryEnvironment(readEnvironment(secretCanariesEnvironment))
	if err != nil {
		return err
	}
	defer func() {
		for _, value := range secret {
			clear(value)
		}
	}()
	protected, err := decodeHoldoutCanaryEnvironment(readEnvironment(protectedCanariesEnvironment))
	if err != nil {
		return err
	}
	for _, value := range protected {
		clear(value)
	}
	return nil
}

func environmentHoldoutAuthority(
	verifier agent.EvaluationAuthorityAttestationVerifier,
	runConfigArtifactSource agent.EvaluationProductionRunConfigArtifactSource,
) (agent.EvaluationHoldoutSealAuthority, error) {
	return agent.NewFileEvaluationHoldoutSealAuthority(agent.EvaluationFileHoldoutSealAuthorityConfig{
		CommitmentPath:            os.Getenv(commitmentPathEnvironment),
		HoldoutDirectory:          os.Getenv(holdoutDirectoryEnvironment),
		ExpectedRepositoryCommit:  os.Getenv(repositoryCommitEnvironment),
		ExpectedWorkflowRunID:     os.Getenv(workflowRunIDEnvironment),
		ExpectedJobID:             os.Getenv(workflowJobEnvironment),
		ExpectedEnvironmentDigest: os.Getenv(environmentDigestEnvironment),
		ExpectedAuthorityID:       os.Getenv(attestationAuthorityEnvironment),
		ExpectedKeyID:             os.Getenv(attestationKeyIDEnvironment),
		Verifier:                  verifier,
		CanarySource:              environmentHoldoutCanarySource,
		RunConfigArtifactSource:   runConfigArtifactSource,
	})
}

func isLoopbackAddress(address string) bool {
	host, port, err := net.SplitHostPort(address)
	portNumber, portErr := strconv.Atoi(port)
	if err != nil || portErr != nil || portNumber < 1 || portNumber > 65_535 ||
		(host != "localhost" && net.ParseIP(host) == nil) {
		return false
	}
	return host == "localhost" || net.ParseIP(host).IsLoopback()
}

func trustedAttestationVerifier(source string) (agent.EvaluationAuthorityAttestationVerifier, error) {
	if source == "" || len(source) > maximumTrustRegistryBytes {
		return nil, errors.New("trusted key registry is missing or too large")
	}
	decoder := json.NewDecoder(bytes.NewBufferString(source))
	decoder.DisallowUnknownFields()
	var configurations []trustedPublicKeyConfiguration
	if err := decoder.Decode(&configurations); err != nil || len(configurations) == 0 || len(configurations) > 64 {
		return nil, errors.New("trusted key registry is invalid")
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return nil, errors.New("trusted key registry has trailing data")
	}
	keys := make(map[string]ed25519.PublicKey, len(configurations))
	for _, configuration := range configurations {
		if !trustKeyIDPattern.MatchString(configuration.KeyID) {
			return nil, errors.New("trusted key identity is invalid")
		}
		decoded, err := base64.RawURLEncoding.DecodeString(configuration.PublicKeyBase64URL)
		if err != nil || len(decoded) != ed25519.PublicKeySize ||
			base64.RawURLEncoding.EncodeToString(decoded) != configuration.PublicKeyBase64URL {
			return nil, errors.New("trusted public key is invalid")
		}
		if _, duplicate := keys[configuration.KeyID]; duplicate {
			return nil, errors.New("trusted key identity is duplicated")
		}
		keys[configuration.KeyID] = ed25519.PublicKey(append([]byte(nil), decoded...))
	}
	return func(_ context.Context, verification agent.EvaluationAuthorityAttestationVerification) error {
		publicKey, ok := keys[verification.KeyID]
		if !ok || verification.Algorithm != "ed25519" || !trustKeyIDPattern.MatchString(verification.AuthorityID) {
			return agent.ErrUnauthorized
		}
		signature, err := base64.RawURLEncoding.DecodeString(verification.SignatureBase64URL)
		if err != nil || len(signature) != ed25519.SignatureSize ||
			base64.RawURLEncoding.EncodeToString(signature) != verification.SignatureBase64URL ||
			!ed25519.Verify(publicKey, verification.AttestedPayloadBytes, signature) {
			return agent.ErrUnauthorized
		}
		return nil
	}, nil
}
