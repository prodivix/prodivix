package auth

import (
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
VALUES ($1, $2, $3, $4, $5)`)).
		WithArgs(sqlmock.AnyArg(), storedToken, "usr_1", sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))

	session := NewSessionStore(db).Create("usr_1", time.Hour)
	if session == nil {
		t.Fatal("expected session")
	}
	if storedToken.value == session.Token {
		t.Fatal("raw bearer token was persisted")
	}
	if storedToken.value != sessionTokenDigest(session.Token) {
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
		WithArgs(sessionTokenDigest(token)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "created_at", "expires_at"}).AddRow("session_1", "usr_1", now, now.Add(time.Hour)))

	session, ok := NewSessionStore(db).Get(token)
	if !ok || session == nil || session.Token != token {
		t.Fatalf("unexpected session: %#v, %v", session, ok)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
