

## Plano: Corrigir gravacao de avaliacoes - solucao definitiva

### Problema identificado

O erro "UPDATE requires a WHERE clause" ocorre porque:

1. Ao inserir uma avaliacao em `system_ratings`, um trigger (`recalc_system_rating_stats`) dispara
2. Esse trigger faz `UPDATE system_rating_stats SET ...` sem clausula WHERE (pois a tabela tem apenas 1 registro)
3. Apesar de o trigger ter `SECURITY DEFINER` e `SET row_security TO off`, o RLS ativo na tabela `system_rating_stats` continua bloqueando a operacao no ambiente hospedado
4. O mesmo problema existe para `module_rating_stats`

### Solucao

Desabilitar RLS nas tabelas de cache de estatisticas. Essas tabelas contem apenas dados agregados (media de estrelas, contagens) e sao escritas exclusivamente por triggers internos do banco. Nao ha risco de seguranca.

### Alteracao necessaria

**Migracao SQL unica:**

```sql
-- Desabilitar RLS nas tabelas de cache de estatisticas
ALTER TABLE public.system_rating_stats DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_rating_stats DISABLE ROW LEVEL SECURITY;
```

### Detalhes tecnicos

- Nenhuma alteracao em codigo da aplicacao
- As politicas de RLS existentes nas tabelas-base (`system_ratings`, `module_ratings`) continuam intactas e protegendo os dados dos usuarios
- Os triggers continuam funcionando normalmente, mas agora sem bloqueio ao atualizar as tabelas de cache
- Esta abordagem elimina a dependencia de `SET row_security TO off` que nao funciona de forma confiavel no ambiente hospedado

