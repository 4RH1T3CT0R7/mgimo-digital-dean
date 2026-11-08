// Package llm — клиент языковой модели с OpenAI-совместимым API (chat/completions): подходит для
// YandexGPT, GigaChat через совместимые шлюзы и других. Ключ — только в переменных окружения сервера.
package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	BaseURL    string // например https://llm.api.cloud.yandex.net/v1
	APIKey     string
	AuthScheme string // «Bearer» или «Api-Key»
	Model      string
	HTTP       *http.Client
}

// New — nil, если ключ не задан: тогда помощник отвечает только из справочника.
func New(baseURL, apiKey, authScheme, model string, timeout time.Duration) *Client {
	if baseURL == "" || apiKey == "" || model == "" {
		return nil
	}
	if authScheme == "" {
		authScheme = "Bearer"
	}
	return &Client{BaseURL: strings.TrimRight(baseURL, "/"), APIKey: apiKey, AuthScheme: authScheme, Model: model,
		HTTP: &http.Client{Timeout: timeout}}
}

type message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Complete отправляет системный промпт и сообщение пользователя и возвращает текст ответа.
func (c *Client) Complete(ctx context.Context, system, user string) (string, error) {
	body, _ := json.Marshal(map[string]any{
		"model":       c.Model,
		"messages":    []message{{"system", system}, {"user", user}},
		"temperature": 0.2,
		"max_tokens":  400,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", c.AuthScheme+" "+c.APIKey)
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		// Тело ответа не пишем в ошибку целиком: там может оказаться что угодно
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
		return "", fmt.Errorf("llm: статус %d", resp.StatusCode)
	}
	var out struct {
		Choices []struct {
			Message message `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&out); err != nil {
		return "", fmt.Errorf("llm: разбор ответа: %w", err)
	}
	if len(out.Choices) == 0 || strings.TrimSpace(out.Choices[0].Message.Content) == "" {
		return "", errors.New("llm: пустой ответ")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}
