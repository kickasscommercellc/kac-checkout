// Leest instellingen uit environment variables en geeft een duidelijke fout als iets ontbreekt.
export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Ontbrekende instelling: ${name} (zie .env.example)`);
  return value;
}
