
## Diagnóstico do Problema

O sistema de Q&A **salva a resposta apenas no banco de dados local**, mas **nunca envia para a API do Mercado Livre**. Por isso:

1. A pergunta aparece como "Respondida" no seu app
2. A pergunta continua "Em aberto" no Mercado Livre
3. Ao sincronizar novamente, aparecem duplicadas (uma respondida local, outra pendente do ML)

### Evidência no código

No arquivo `src/hooks/useQA.ts` (função `useCreateResponse`, linhas 122-193):
- Salva a resposta na tabela `qa_responses` com `is_sent: false`
- Atualiza o status da pergunta para `answered`
- **Não faz nenhuma chamada à API do Mercado Livre**

A tabela `qa_responses` já tem campos preparados (`is_sent`, `sent_at`, `ml_response_id`, `send_error`) que nunca são utilizados.

---

## Solução

### 1. Criar Edge Function `ml-answer-question`

Nova função que faz o POST para a API do Mercado Livre:

- Endpoint ML: `POST https://api.mercadolibre.com/answers`
- Payload: `{ "question_id": 123456, "text": "Sua resposta aqui" }`
- Atualiza `qa_responses` com `is_sent = true`, `sent_at`, `ml_response_id`
- Em caso de erro, registra em `send_error` e mantém `is_sent = false`

### 2. Alterar o fluxo de envio no `useCreateResponse`

Modificar a mutation para:

1. Salvar a resposta localmente (como rascunho temporário)
2. Chamar a Edge Function `ml-answer-question`
3. Se sucesso: atualizar `is_sent = true` e status da pergunta para `answered`
4. Se erro: manter status `pending`, mostrar erro específico ao usuário

### 3. Adicionar tratamento de erros específicos

Possíveis erros da API do ML que precisam ser tratados:

- **Token expirado**: Auto-refresh e retry
- **Pergunta já respondida**: Sincronizar novamente para obter a resposta existente
- **Pergunta deletada pelo comprador**: Marcar como `archived`
- **Conteúdo bloqueado pelo ML**: Mostrar motivo específico

### 4. Atualizar a UI com feedback adequado

- Mostrar spinner durante o envio real ao ML
- Em caso de erro, mostrar mensagem específica (não apenas "Erro")
- Botão "Tentar novamente" para respostas com falha

---

## Arquivos a serem modificados/criados

| Arquivo | Ação |
|---------|------|
| `supabase/functions/ml-answer-question/index.ts` | Criar - Edge Function para enviar resposta ao ML |
| `src/hooks/useQA.ts` | Modificar - Chamar a Edge Function ao enviar |
| `src/components/qa/QaResponseEditor.tsx` | Modificar - Melhorar feedback de erro/sucesso |

---

## Detalhes Técnicos

### Edge Function `ml-answer-question`

```text
┌─────────────────────────────────────────────────────────────────┐
│  Frontend chama ml-answer-question                              │
│  ↓                                                              │
│  1. Valida autenticação do usuário                              │
│  2. Busca access_token do ML para o seller_id                   │
│  3. Refresh token se necessário                                 │
│  4. POST https://api.mercadolibre.com/answers                   │
│     Body: { "question_id": ml_question_id, "text": resposta }   │
│  5. Se sucesso: retorna { success: true, ml_response_id }       │
│  6. Se erro: retorna { success: false, error_code, message }    │
└─────────────────────────────────────────────────────────────────┘
```

### Fluxo atualizado do `useCreateResponse`

```text
┌─────────────────────────────────────────────────────────────────┐
│  Usuário clica "Enviar"                                         │
│  ↓                                                              │
│  1. Insere resposta em qa_responses (is_draft=false, is_sent=0) │
│  2. Chama ml-answer-question                                    │
│  3. Se ML retornar sucesso:                                     │
│     - Atualiza qa_responses: is_sent=true, ml_response_id       │
│     - Atualiza qa_questions: status=answered                    │
│     - Toast: "Resposta enviada com sucesso"                     │
│  4. Se ML retornar erro:                                        │
│     - Atualiza qa_responses: send_error = mensagem              │
│     - Mantém qa_questions: status=pending                       │
│     - Toast: "Erro ao enviar: [motivo específico]"              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Critérios de Aceite

1. Ao clicar "Enviar", a resposta é postada no Mercado Livre (verificável abrindo a pergunta no ML)
2. O campo `is_sent` em `qa_responses` reflete corretamente se foi enviado ao ML
3. Se o ML rejeitar a resposta, o usuário vê o motivo específico
4. Após envio bem-sucedido, a pergunta não reaparece como "pendente" na próxima sincronização
