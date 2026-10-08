// Municípios da Grande SP atendidos por Flex.
// Grafia conforme o Mercado Livre devolve em shipping_city.
export const FLEX_CITIES_SP: string[] = [
  "Arujá",
  "Barueri",
  "Caieiras",
  "Cajamar",
  "Carapicuíba",
  "Cotia",
  "Diadema",
  "Embu das Artes",
  "Ferraz de Vasconcelos",
  "Francisco Morato",
  "Franco da Rocha",
  "Guarulhos",
  "Itapevi",
  "Itaquaquecetuba",
  "Jandira",
  "Mairiporã",
  "Mauá",
  "Mogi das Cruzes",
  "Osasco",
  "Poá",
  "Santana de Parnaíba",
  "Santo André",
  "São Bernardo do Campo",
  "São Caetano do Sul",
  "Suzano",
  "Taboão da Serra",
];

// Faixas de CEP da capital consideradas Flex (limites inclusivos, só dígitos).
// SEED AMPLO: cobre a capital inteira (01000-000 a 05999-999 e 08000-000 a 08499-999).
// Refinar depois com o export de cobertura Flex por CEP do painel do Mercado Livre —
// a periferia (Perus, Anhanguera, Jaraguá, Brasilândia, Tremembé, Parelheiros,
// Marsilac, Grajaú, Cidade Dutra, Capão Redondo, Jardim Ângela, Cidade Tiradentes,
// Iguatemi, São Rafael) não está na cobertura e hoje entra como Flex por este seed.
export const FLEX_CAPITAL_CEP_RANGES: Array<[number, number]> = [
  [1000000, 5999999],
  [8000000, 8499999],
];

export function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const FLEX_CITY_SET = new Set(FLEX_CITIES_SP.map(normalizeName));

export function parseCep(zip: string | null | undefined): number | null {
  const digits = (zip ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return null;
  return Number(digits);
}

export function isFlexLocation(params: {
  uf: string | null | undefined;
  city: string | null | undefined;
  zipcode: string | null | undefined;
}): boolean {
  if (normalizeName(params.uf) !== "sp") return false;

  const city = normalizeName(params.city);
  if (city === "sao paulo") {
    const cep = parseCep(params.zipcode);
    if (cep === null) return false;
    return FLEX_CAPITAL_CEP_RANGES.some(([from, to]) => cep >= from && cep <= to);
  }

  return FLEX_CITY_SET.has(city);
}
