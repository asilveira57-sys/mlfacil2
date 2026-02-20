

## Corrigir Cabeçalhos nas Etiquetas: NF Sem Cabeçalho, Mapeamento Correto

### Diagnostico

Analisei o PDF gerado e identifiquei a **causa raiz** de todos os problemas. E uma unica falha no mapeamento de paginas:

**O bug**: A funcao `addHeadersToPdf` assume que cada pagina corresponde a um shipment (pagina 0 = shipment 0, pagina 1 = shipment 1...). Porem, a API do Mercado Livre retorna **2 paginas por envio**: a etiqueta de envio + a NF (DANFE). Com 8 envios, o PDF tem 16 paginas.

O resultado:
- Pagina 0 (etiqueta 1) recebe cabecalho do shipment 0 (correto por acaso)
- Pagina 1 (NF 1) recebe cabecalho do shipment 1 (ERRADO - NF nao deve ter cabecalho, e o cabecalho e de outro pedido)
- Pagina 2 (etiqueta 2) recebe cabecalho do shipment 2 (cabecalho trocado - deveria ser shipment 1)
- Pagina 8+ (etiqueta 5 em diante) nao tem shipment correspondente, fica sem cabecalho

Isso explica **todos** os 4 sintomas reportados:
1. NF com cabecalho - porque paginas impares (NFs) recebem cabecalho
2. Cabecalho trocado entre pedidos - o mapeamento 1:1 esta errado
3. Etiquetas sem cabecalho - paginas alem do indice 7 nao tem shipment correspondente
4. NF esticada/reduzida - o codigo adiciona 65pt de altura a TODAS as paginas, inclusive NFs

**Sobre o comentario da venda 2000011596874365**: O campo `order_comment` esta NULL no cache. O campo `comments` da API do ML pode nao ser o campo correto para observacoes do comprador. Isso sera investigado separadamente.

### Solucao

#### 1. Corrigir `addHeadersToPdf` para distinguir etiquetas de NFs

A logica sera:
- Se o numero de paginas = 2x o numero de shipments: paginas vem em pares (etiqueta, NF)
  - Paginas pares (0, 2, 4...): etiquetas - recebem cabecalho
  - Paginas impares (1, 3, 5...): NFs - passam sem modificacao alguma (sem cabecalho, sem redimensionar)
  - Mapeamento: `shipmentIds[Math.floor(i / 2)]`
- Se o numero de paginas = numero de shipments: sem NF, mapeamento 1:1 (comportamento atual)
- Fallback para outros casos: deteccao por dimensao da pagina (etiquetas ~283x425pt, NFs maiores)

#### 2. NF sem redimensionar

Paginas identificadas como NF serao copiadas com dimensoes originais intactas, sem adicionar os 65pt de altura do cabecalho.

### Detalhes Tecnicos

**Arquivo a editar**: `supabase/functions/ml-generate-labels/index.ts`

**Funcao `addHeadersToPdf`** (linhas 228-296) sera reescrita:

```text
// Detectar modo de paginacao
const pagesPerShipment = pageCount === shipmentIds.length * 2 ? 2 : 1;

for (let i = 0; i < pageCount; i++) {
  const isNfPage = pagesPerShipment === 2 && i % 2 === 1;
  
  if (isNfPage) {
    // NF: copiar sem modificacao
    const newPage = resultPdf.addPage([origWidth, origHeight]);
    newPage.drawPage(embeddedPage, { x: 0, y: 0 });
    continue;
  }
  
  // Etiqueta: calcular indice correto do shipment
  const shipmentIndex = pagesPerShipment === 2 ? Math.floor(i / 2) : i;
  const shipmentId = shipmentIndex < shipmentIds.length ? shipmentIds[shipmentIndex] : null;
  const headerLines = shipmentId ? (headerDataMap.get(shipmentId) || []) : [];
  
  // ... adicionar cabecalho normalmente
}
```

**Sobre o comentario**: A investigacao do campo `order.comments` vs `order.notes` da API do ML sera tratada separadamente, pois requer analise da resposta real da API.

