package config

import (
	"errors"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
)

var databaseStructuredEnvironment = [...]string{
	"BACKEND_DB_HOST",
	"BACKEND_DB_PORT",
	"BACKEND_DB_USER",
	"BACKEND_DB_PASSWORD",
	"BACKEND_DB_NAME",
	"BACKEND_DB_SSLMODE",
}

// Structured credentials are encoded only here, before the pgx connection
// boundary; neither raw credentials nor the assembled URL enter diagnostics.
func loadDatabaseURL(environment string) (string, error) {
	databaseURL := strings.TrimSpace(os.Getenv("BACKEND_DB_URL"))
	structured := false
	fields := make(map[string]string, len(databaseStructuredEnvironment))
	for _, key := range databaseStructuredEnvironment {
		value, present := os.LookupEnv(key)
		structured = structured || present
		fields[key] = value
	}
	if structured {
		if databaseURL != "" {
			return "", errors.New("BACKEND_DB_URL cannot be combined with structured BACKEND_DB configuration")
		}
		for _, key := range databaseStructuredEnvironment {
			if fields[key] == "" {
				return "", errors.New("structured database configuration requires " + key)
			}
		}
		host := fields["BACKEND_DB_HOST"]
		if strings.ContainsAny(host, "/\\?#@[] \t\r\n") ||
			(strings.Contains(host, "%") && !strings.Contains(host, ":")) {
			return "", errors.New("BACKEND_DB_HOST must be a bare hostname or IP address")
		}
		if strings.Contains(host, ":") {
			address, zone, scoped := strings.Cut(host, "%")
			if net.ParseIP(address) == nil || (scoped && zone == "") {
				return "", errors.New("BACKEND_DB_HOST must be a bare hostname or IP address")
			}
		}
		portText := fields["BACKEND_DB_PORT"]
		for _, character := range portText {
			if character < '0' || character > '9' {
				return "", errors.New("BACKEND_DB_PORT must be an integer between 1 and 65535")
			}
		}
		port, err := strconv.ParseUint(portText, 10, 16)
		if err != nil || port == 0 {
			return "", errors.New("BACKEND_DB_PORT must be an integer between 1 and 65535")
		}
		sslmode := fields["BACKEND_DB_SSLMODE"]
		switch sslmode {
		case "disable", "allow", "prefer", "require", "verify-ca", "verify-full":
		default:
			return "", errors.New("BACKEND_DB_SSLMODE must be a supported PostgreSQL SSL mode")
		}
		connection := url.URL{
			Scheme:   "postgres",
			User:     url.UserPassword(fields["BACKEND_DB_USER"], fields["BACKEND_DB_PASSWORD"]),
			Host:     net.JoinHostPort(host, strconv.FormatUint(port, 10)),
			Path:     "/" + fields["BACKEND_DB_NAME"],
			RawPath:  "/" + url.PathEscape(fields["BACKEND_DB_NAME"]),
			RawQuery: url.Values{"sslmode": {sslmode}}.Encode(),
		}
		databaseURL = connection.String()
		parsed, err := url.Parse(databaseURL)
		if err != nil || parsed.Hostname() != host {
			return "", errors.New("BACKEND_DB_HOST must be a bare hostname or IP address")
		}
	} else if databaseURL == "" {
		if environment != "development" && environment != "test" {
			return "", errors.New("BACKEND_DB_URL or complete structured database configuration is required outside development and test")
		}
		databaseURL = "postgres://postgres:postgres@localhost:5432/prodivix?sslmode=disable"
	}
	if environment == "production" && databaseUsesDefaultCredentials(databaseURL) {
		return "", errors.New("database configuration must not use the default postgres password in production")
	}
	return databaseURL, nil
}

func databaseUsesDefaultCredentials(databaseURL string) bool {
	if strings.Contains(strings.ToLower(databaseURL), "postgres:postgres@") {
		return true
	}
	parsed, err := url.Parse(databaseURL)
	if err != nil || parsed.User == nil {
		return false
	}
	password, present := parsed.User.Password()
	return present && strings.EqualFold(parsed.User.Username(), "postgres") && strings.EqualFold(password, "postgres")
}
