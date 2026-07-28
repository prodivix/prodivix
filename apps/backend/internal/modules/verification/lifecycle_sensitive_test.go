package verification

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestLifecycleMutationsRejectSensitiveCallerTextBeforePersistence(t *testing.T) {
	t.Parallel()
	const sensitive = "known-lifecycle-canary"
	service := &Service{
		permissions: allowVerificationPermissions{},
		candidates:  NewCandidateValidator([]string{sensitive}),
	}
	ctx := context.Background()
	tests := []struct {
		name string
		run  func() error
	}{
		{
			name: "supersede reason",
			run: func() error {
				_, err := service.SupersedeEvidence(
					ctx,
					"owner-vector",
					"workspace-vector",
					"evidence-old",
					"evidence-new",
					"contains "+sensitive,
					"mutation-sensitive-supersede-001",
					"active",
					"active",
					"none",
				)
				return err
			},
		},
		{
			name: "retention external ref",
			run: func() error {
				_, _, err := service.ProtectEvidence(
					ctx,
					"owner-vector",
					"workspace-vector",
					"evidence-vector",
					"change",
					"Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
					"mutation-sensitive-protect-001",
					"active",
					"absent",
				)
				return err
			},
		},
		{
			name: "release external ref",
			run: func() error {
				_, _, err := service.ReleaseProtection(
					ctx,
					"owner-vector",
					"workspace-vector",
					"evidence-vector",
					"protection-vector",
					"change",
					"owner@example.invalid",
					1,
					"mutation-sensitive-release-001",
					"active",
				)
				return err
			},
		},
		{
			name: "tombstone reason",
			run: func() error {
				_, err := service.TombstoneEvidence(
					ctx,
					"owner-vector",
					"workspace-vector",
					"evidence-vector",
					"password=correct-horse-battery-staple",
					"mutation-sensitive-tombstone-001",
					"active",
				)
				return err
			},
		},
		{
			name: "revocation reason",
			run: func() error {
				_, _, err := service.CreateRevocation(
					ctx,
					"owner-vector",
					"workspace-vector",
					RevocationInput{
						EvidenceID:  "evidence-vector",
						ReasonCode:  "credential-exposed",
						Reason:      "ghp_abcdefghijklmnopqrstuvwxyz123456",
						EffectiveAt: time.Now().UTC(),
					},
					"mutation-sensitive-revocation-001",
					"unrevoked",
				)
				return err
			},
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			err := test.run()
			var codedError *CodedError
			if !errors.As(err, &codedError) || codedError.Code != "VER-5002" {
				t.Fatalf("sensitive lifecycle mutation = %v, want VER-5002", err)
			}
			if strings.Contains(err.Error(), sensitive) ||
				strings.Contains(err.Error(), "correct-horse") ||
				strings.Contains(err.Error(), "ghp_") ||
				strings.Contains(err.Error(), "example.invalid") {
				t.Fatalf("sensitive lifecycle error echoed caller text: %v", err)
			}
		})
	}
}
