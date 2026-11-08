// Package migrations — SQL-миграции сервиса (goose), встроенные в бинарник.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
