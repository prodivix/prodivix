package config

import (
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

func emptyDatabaseEnvironment(t *testing.T) {
	t.Helper()
	for _, key := range append([]string{"BACKEND_DB_URL"}, databaseStructuredEnvironment[:]...) {
		value, present := os.LookupEnv(key)
		if err := os.Unsetenv(key); err != nil {
			t.Fatal("could not isolate database configuration")
		}
		t.Cleanup(func() {
			if present {
				if err := os.Setenv(key, value); err != nil {
					t.Fatal("could not restore database configuration")
				}
			} else if err := os.Unsetenv(key); err != nil {
				t.Fatal("could not restore database configuration")
			}
		})
	}
}

func structuredDatabaseEnvironment(t *testing.T) {
	t.Helper()
	emptyDatabaseEnvironment(t)
	for key, value := range map[string]string{
		"BACKEND_DB_HOST":     "postgres.internal",
		"BACKEND_DB_PORT":     "5432",
		"BACKEND_DB_USER":     "application",
		"BACKEND_DB_PASSWORD": "example-password",
		"BACKEND_DB_NAME":     "prodivix",
		"BACKEND_DB_SSLMODE":  "require",
	} {
		t.Setenv(key, value)
	}
}

func TestDatabaseConfigPreservesURLAndDevelopmentDefaults(t *testing.T) {
	for _, environment := range []string{"development", "test"} {
		t.Run(environment, func(t *testing.T) {
			emptyDatabaseEnvironment(t)
			got, err := loadDatabaseURL(environment)
			if err != nil || got != "postgres://postgres:postgres@localhost:5432/prodivix?sslmode=disable" {
				t.Fatal("development database fallback changed")
			}
		})
	}
	for _, source := range []string{
		"postgres://application:example%40password@postgres.internal:5432/prodivix?sslmode=verify-full&connect_timeout=10",
		"host=postgres.internal user=application password=example-password dbname=prodivix sslmode=require",
	} {
		t.Run(source, func(t *testing.T) {
			emptyDatabaseEnvironment(t)
			t.Setenv("BACKEND_DB_URL", " \t"+source+"\n")
			got, err := loadDatabaseURL("production")
			if err != nil || got != source {
				t.Fatal("existing explicit database configuration changed")
			}
		})
	}
	for _, environment := range []string{"production", "staging"} {
		t.Run(environment, func(t *testing.T) {
			emptyDatabaseEnvironment(t)
			if _, err := loadDatabaseURL(environment); err == nil {
				t.Fatal("database fallback was allowed outside development/test")
			}
		})
	}
}

func TestDatabaseConfigRoundTripsExactStructuredCredentials(t *testing.T) {
	for _, password := range []string{
		"uri@/:=%?#&+;$",
		" leading and trailing ",
		" ",
		"数据库🔒 @/:=%",
	} {
		t.Run(password, func(t *testing.T) {
			structuredDatabaseEnvironment(t)
			username := " application:@/% "
			database := " db /?#:%=+ "
			t.Setenv("BACKEND_DB_USER", username)
			t.Setenv("BACKEND_DB_PASSWORD", password)
			t.Setenv("BACKEND_DB_NAME", database)
			got, err := loadDatabaseURL("production")
			if err != nil {
				t.Fatal("legal structured credentials were rejected")
			}
			parsed, err := url.Parse(got)
			if err != nil {
				t.Fatal("structured database URL was malformed")
			}
			gotPassword, passwordPresent := parsed.User.Password()
			if parsed.User.Username() != username || !passwordPresent || gotPassword != password ||
				strings.TrimPrefix(parsed.Path, "/") != database || parsed.Host != "postgres.internal:5432" ||
				parsed.Fragment != "" || len(parsed.Query()) != 1 || parsed.Query().Get("sslmode") != "require" ||
				!strings.Contains(parsed.EscapedPath(), "%2F") {
				t.Fatal("credentials or database identity changed during URL encoding")
			}
			driver, err := pgx.ParseConfig(got)
			if err != nil || driver.User != username || driver.Password != password ||
				driver.Database != database || driver.Host != "postgres.internal" || driver.Port != 5432 {
				t.Fatal("pgx did not preserve encoded credentials and database identity")
			}
		})
	}
}

func TestDatabaseConfigSupportsIPv6AndPostgreSQLSSLModes(t *testing.T) {
	for _, host := range []string{"::1", "2001:db8::10", "fe80::1%eth0"} {
		t.Run(host, func(t *testing.T) {
			structuredDatabaseEnvironment(t)
			t.Setenv("BACKEND_DB_HOST", host)
			got, err := loadDatabaseURL("production")
			if err != nil {
				t.Fatal("bare IPv6 host was rejected")
			}
			parsed, err := url.Parse(got)
			if err != nil || parsed.Hostname() != host || parsed.Port() != "5432" {
				t.Fatal("IPv6 host or port changed during URL encoding")
			}
		})
	}
	for _, sslmode := range []string{"disable", "allow", "prefer", "require", "verify-ca", "verify-full"} {
		t.Run(sslmode, func(t *testing.T) {
			structuredDatabaseEnvironment(t)
			t.Setenv("BACKEND_DB_SSLMODE", sslmode)
			got, err := loadDatabaseURL("production")
			if err != nil {
				t.Fatal("supported PostgreSQL SSL mode was rejected")
			}
			parsed, err := url.Parse(got)
			if err != nil || parsed.Query().Get("sslmode") != sslmode {
				t.Fatal("PostgreSQL SSL mode changed")
			}
		})
	}
}

func TestDatabaseConfigRejectsPartialOrMixedSourcesWithoutSecretDiagnostics(t *testing.T) {
	for _, key := range databaseStructuredEnvironment {
		t.Run("missing "+key, func(t *testing.T) {
			structuredDatabaseEnvironment(t)
			if err := os.Unsetenv(key); err != nil {
				t.Fatal("could not isolate missing field")
			}
			if _, err := loadDatabaseURL("development"); err == nil {
				t.Fatal("partial structured configuration used development fallback")
			}
		})
		t.Run("mixed "+key, func(t *testing.T) {
			emptyDatabaseEnvironment(t)
			secret := "example-secret@/:=%"
			t.Setenv("BACKEND_DB_URL", "postgres://application:example-secret%40%2F%3A%3D%25@postgres.internal/prodivix")
			t.Setenv(key, "")
			_, err := loadDatabaseURL("test")
			if err == nil || strings.Contains(err.Error(), secret) || strings.Contains(err.Error(), "example-secret") {
				t.Fatal("mixed configuration was accepted or exposed credentials")
			}
		})
	}
}

func TestDatabaseConfigRejectsInvalidStructuredFields(t *testing.T) {
	for _, invalid := range []struct {
		field string
		value string
	}{
		{"BACKEND_DB_HOST", ""},
		{"BACKEND_DB_HOST", "postgres.internal:5432"},
		{"BACKEND_DB_HOST", "postgres.internal/other"},
		{"BACKEND_DB_HOST", "postgres.internal?sslmode=disable"},
		{"BACKEND_DB_HOST", "[::1]"},
		{"BACKEND_DB_HOST", "fe80::1%"},
		{"BACKEND_DB_HOST", " postgres.internal "},
		{"BACKEND_DB_HOST", "postgres%internal"},
		{"BACKEND_DB_PORT", ""},
		{"BACKEND_DB_PORT", "0"},
		{"BACKEND_DB_PORT", "-1"},
		{"BACKEND_DB_PORT", "+5432"},
		{"BACKEND_DB_PORT", "65536"},
		{"BACKEND_DB_PORT", "5432?sslmode=disable"},
		{"BACKEND_DB_USER", ""},
		{"BACKEND_DB_PASSWORD", ""},
		{"BACKEND_DB_NAME", ""},
		{"BACKEND_DB_SSLMODE", ""},
		{"BACKEND_DB_SSLMODE", "unknown"},
		{"BACKEND_DB_SSLMODE", "require&host=other"},
	} {
		t.Run(invalid.field+" "+invalid.value, func(t *testing.T) {
			structuredDatabaseEnvironment(t)
			t.Setenv(invalid.field, invalid.value)
			if _, err := loadDatabaseURL("test"); err == nil {
				t.Fatal("invalid structured field was accepted")
			}
		})
	}
}

func TestDatabaseConfigRejectsProductionDefaultCredentials(t *testing.T) {
	for _, source := range []string{
		"postgres://postgres:postgres@postgres.internal/prodivix",
		"postgres://Postgres:PoStGrEs@postgres.internal/prodivix",
		"postgres://%70ostgres:po%73tgres@postgres.internal/prodivix",
		"postgresql://%70ostgres:%70ostgres@postgres.internal/prodivix",
	} {
		t.Run(source, func(t *testing.T) {
			emptyDatabaseEnvironment(t)
			t.Setenv("BACKEND_DB_URL", source)
			if _, err := loadDatabaseURL("production"); err == nil {
				t.Fatal("default URL credentials were allowed in production")
			}
		})
	}
	t.Run("structured", func(t *testing.T) {
		structuredDatabaseEnvironment(t)
		t.Setenv("BACKEND_DB_USER", "postgres")
		t.Setenv("BACKEND_DB_PASSWORD", "postgres")
		if _, err := loadDatabaseURL("production"); err == nil {
			t.Fatal("default structured credentials were allowed in production")
		}
		if _, err := loadDatabaseURL("test"); err != nil {
			t.Fatal("development/test default credential behavior changed")
		}
		t.Setenv("BACKEND_DB_PASSWORD", " postgres ")
		if _, err := loadDatabaseURL("production"); err != nil {
			t.Fatal("password whitespace was trimmed before validation")
		}
	})
}

func TestLoadConfigUsesStructuredDatabaseOwner(t *testing.T) {
	structuredDatabaseEnvironment(t)
	t.Setenv("APP_ENV", "test")
	config, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(config.DatabaseURL)
	if err != nil || parsed.Hostname() != "postgres.internal" ||
		parsed.Query().Get("sslmode") != "require" || parsed.User.Username() != "application" {
		t.Fatal("LoadConfig did not use the structured database owner")
	}
}
