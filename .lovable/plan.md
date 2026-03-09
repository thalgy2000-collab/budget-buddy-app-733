

## Plano: Tornar nomes das categorias editáveis

### O que muda

1. **`src/hooks/useBudget.ts`** — Adicionar função `renameCategory(id: string, newName: string)` que atualiza o nome da categoria no state e persiste no localStorage.

2. **`src/components/BudgetTable.tsx`** — Tornar o nome da categoria clicável para edição inline:
   - Ao clicar no nome, trocar o `<span>` por um `<Input>` com o nome atual.
   - Ao pressionar Enter ou perder foco (onBlur), salvar o novo nome via `renameCategory`.
   - Ao pressionar Escape, cancelar a edição.
   - Estado local: `editingCatId` e `editingName`.

3. **`src/pages/Index.tsx`** — Passar `renameCategory` como prop para `BudgetTable`.

### Detalhes técnicos

- O `BudgetTable` recebe nova prop `renameCategory: (id: string, newName: string) => void`
- A edição inline usa um input pequeno que aparece no lugar do texto, sem modal
- Validação simples: nome não pode ficar vazio (reverte ao original se vazio)

