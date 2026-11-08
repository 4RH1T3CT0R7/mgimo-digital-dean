// hashpw печатает bcrypt-хеш пароля из stdin — для тестовых данных (T07, D38).
// Пароль в репозиторий не попадает: в seed кладётся только хеш.
//
//	echo -n 'пароль' | go run ./cmd/hashpw
package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && line == "" {
		fmt.Fprintln(os.Stderr, "передайте пароль через stdin")
		os.Exit(1)
	}
	password := strings.TrimRight(line, "\r\n")
	if len(password) < 8 {
		fmt.Fprintln(os.Stderr, "пароль короче 8 символов")
		os.Exit(1)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(string(hash))
}
