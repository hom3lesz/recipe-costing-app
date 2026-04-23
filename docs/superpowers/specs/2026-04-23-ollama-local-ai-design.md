# Ollama Local AI Integration Design

**Goal:** Add Ollama as a first-class local AI model option alongside Claude and Gemini, usable for all text-based AI features, with automatic vision fallback for invoice scanning.

**Architecture:** Ollama slots into the existing `AI_MODELS` array. Its "key" is the model name string. A new `callOllamaText()` function hits the local Ollama API. All existing AI call sites add an Ollama branch via a shared `callAiText()` dispatcher. No changes to existing Claude/Gemini paths.

**Tech Stack:** Vanilla JS, Electron, Ollama REST API (`http://localhost:11434`), existing `_apiKeys` / `AI_MODELS` / `getAiKey` infrastructure.

---

## Change 1 — Model registration

Add Ollama to `AI_MODELS` in `src/app.js`:

```js
{ id: "ollama", label: "Ollama (Local)", keyHint: "model name" }
```

The value stored via `saveAiKey("ollama", name)` is the model name (e.g. `qwen3:30b`), not an API key. The existing key storage, retrieval, and enable/disable logic is unchanged — a blank model name means unconfigured.

---

## Change 2 — Settings UI

In the AI Settings panel, Ollama appears as a row after the cloud models with:

- **Model name input** — plain text (not password), placeholder `e.g. qwen3:30b`, saves on blur
- **Test button** — pings `http://localhost:11434/api/tags`, then checks if the entered model name appears in the returned list. Displays one of:
  - 🟢 `Connected — {modelName} ready`
  - 🟡 `Ollama running but model not found — run: ollama pull {modelName}`
  - 🔴 `Ollama not running — start it with: ollama serve`
- **Model selector dropdown** — Ollama appears alongside Claude/Gemini. Greyed out with tooltip `"Enter a model name in Settings first"` if unconfigured.

---

## Change 3 — `callOllamaText()` function

New function in `src/app.js`:

```js
async function callOllamaText(prompt, maxTokens) {
  const modelName = getAiKey("ollama");
  if (!modelName) throw new Error("No Ollama model configured — add one in Settings → AI Models.");
  const res = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      ...(maxTokens ? { options: { num_predict: maxTokens } } : {}),
    }),
  });
  if (!res.ok) throw new Error("Ollama not reachable — make sure it's running (ollama serve).");
  const data = await res.json();
  return data.message?.content || "";
}
```

---

## Change 4 — `callAiText()` dispatcher

New shared dispatcher replaces direct `callGeminiText()` calls at all text AI call sites:

```js
async function callAiText(prompt, model, maxTokens) {
  if (model === "ollama") return callOllamaText(prompt, maxTokens);
  if (model.startsWith("gemini")) return callGeminiText(prompt, maxTokens);
  return callClaudeText(prompt, maxTokens);
}
```

Call sites updated to use `callAiText(prompt, selectedModel, maxTokens)`:
- Recipe method writer (`openAIMethodWriter`)
- Nutrition lookup (Gemini nutrition fetch)
- Specials board descriptions
- Cost analysis / AI suggestions

---

## Change 5 — Vision fallback for invoice scanning

Invoice scanning requires a vision-capable model. When the selected model is `ollama`:

1. Find the first configured cloud model: check `getAiKey("claude")` then `getAiKey("gemini-flash")` then `getAiKey("gemini-flash-lite")`.
2. If a cloud model is found, use it silently (no toast, no disruption).
3. If no cloud model is configured, show error toast: *"Invoice scanning requires a vision-capable model — add a Claude or Gemini key in Settings → AI Models."* and abort.

---

## Acceptance criteria

- Ollama appears in the AI Models settings panel with a model name field and Test button
- Test button correctly reports connected / model missing / Ollama not running
- All text AI features (method writer, nutrition, specials, cost analysis) work with Ollama selected
- Invoice scanning uses a cloud model when Ollama is selected; shows a clear error if no cloud model is configured
- Selecting Ollama when unconfigured shows the same "no AI key" toast as cloud models
- Existing Claude and Gemini flows are completely unchanged
