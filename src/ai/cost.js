// ЛЗ 12, шаги 12–13: стоимость эксплуатации и точка, где свой сервер дешевле API.
// Тарифы — с источником и датой обращения. Всё, что придумано, помечено как допущение.

export const TARIFF = {
  name: 'Claude Haiku 5.5 (запросы до 100 000 токенов)',
  inputPerM: 0.10, // $ за 1 млн входных токенов
  outputPerM: 0.50, // $ за 1 млн выходных токенов
  url: 'https://platform.claude.com/docs/en/about-claude/pricing',
  accessed: '24.11.2026',
};

export const ASSUMPTIONS = {
  usdKzt: { value: 500, text: 'курс 1 $ = 500 ₸ (допущение для расчёта; заменить курсом НБ РК на дату сдачи)' },
  serverKzt: { value: 15000, text: 'аренда сервера 4 vCPU / 8 ГБ ОЗУ в Казахстане — 15 000 ₸ в месяц (допущение; заменить реальным предложением хостинга с датой)' },
  callsPerBooking: { value: 1.5, text: '1,5 обращения к модели на одну запись: подсказка пересчитывается, если владелец дописывает жалобу (допущение; проверить по журналу ai_suggestions)' },
};

// tokens: { input, output } — средняя длина, измеренная токенизатором модели (prompt_eval_count / eval_count)
export function costModel({ bookingsPerMonth, tokens }) {
  const requests = Math.round(bookingsPerMonth * ASSUMPTIONS.callsPerBooking.value);
  if (!tokens?.input) return { requests, measured: false };
  const perRequest = (tokens.input * TARIFF.inputPerM + tokens.output * TARIFF.outputPerM) / 1e6;
  const monthUsd = requests * perRequest;
  const serverUsd = ASSUMPTIONS.serverKzt.value / ASSUMPTIONS.usdKzt.value;
  return {
    measured: true, requests, perRequest, tokensIn: tokens.input, tokensOut: tokens.output, monthUsd, monthKzt: monthUsd * ASSUMPTIONS.usdKzt.value,
    x10Usd: monthUsd * 10, x10Kzt: monthUsd * 10 * ASSUMPTIONS.usdKzt.value,
    serverUsd, breakEvenRequests: Math.ceil(serverUsd / perRequest),
    breakEvenTimes: serverUsd / perRequest / requests,
  };
}
