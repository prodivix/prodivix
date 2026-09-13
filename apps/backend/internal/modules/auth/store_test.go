package auth

import (
	"database/sql"
	"database/sql/driver"
	"regexp"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

type captureStringArgument struct {
	value string
}

func (argument *captureStringArgument) Match(value driver.Value) bool {
	text, ok := value.(string)
	if ok {
		argument.value = text
	}
	return ok
}

func TestSessionStorePersistsOnlyTokenDigest(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	storedToken := &captureStringArgument{}
	mock.ExpectExec(regexp.QuoteMeta(`INSERT INTO sessions (id, token, user_id, created_at, expires_at)
SELECT $1, $2, id, $4, $5 FROM users WHERE id = $3 AND password_hash = $6 FOR SHARE`)).
		WithArgs(sqlmock.AnyArg(), storedToken, "usr_1", sqlmock.AnyArg(), sqlmock.AnyArg(), []byte("verified-hash")).
		WillReturnResult(sqlmock.NewResult(1, 1))

	session, err := NewSessionStore(db).Create(&User{ID: "usr_1", PasswordHash: []byte("verified-hash")}, time.Hour)
	if err != nil || session == nil {
		t.Fatal("expected session")
	}
	if storedToken.value == session.Token {
		t.Fatal("raw bearer token was persisted")
	}
	if storedToken.value != authTokenDigest(session.Token) {
		t.Fatal("persisted token was not the expected digest")
	}
}

func TestSessionStoreReadsTokenDigest(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	token := "client-secret"
	query := regexp.QuoteMeta(`SELECT id, user_id, created_at, expires_at
FROM sessions
WHERE token = $1 AND expires_at > NOW()`)
	now := time.Now().UTC()
	mock.ExpectQuery(query).
		WithArgs(authTokenDigest(token)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "created_at", "expires_at"}).AddRow("session_1", "usr_1", now, now.Add(time.Hour)))

	session, ok := NewSessionStore(db).Get(token)
	if !ok || session == nil || session.Token != token {
		t.Fatalf("unexpected session: %#v, %v", session, ok)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestSessionStoreRejectsAStoredDigestAsBearerToken(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	storedDigest := authTokenDigest("client-secret")
	query := regexp.QuoteMeta(`SELECT id, user_id, created_at, expires_at
FROM sessions
WHERE token = $1 AND expires_at > NOW()`)
	mock.ExpectQuery(query).
		WithArgs(authTokenDigest(storedDigest)).
		WillReturnError(sql.ErrNoRows)

	if session, ok := NewSessionStore(db).Get(storedDigest); ok || session != nil {
		t.Fatalf("stored digest authenticated as a bearer token: %#v", session)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
