const KM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** 148320 → "148.320 km" */
export function formatKm(km: number): string {
  return `${KM.format(Math.round(km))} km`;
}

/** 45 → "45 min"; 120 → "2 h"; 150 → "2 h 30 min" */
export function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** "há 3.400 km" / "agora" */
export function formatKmAgo(km: number): string {
  return km <= 0 ? 'agora' : `há ${formatKm(km)}`;
}
