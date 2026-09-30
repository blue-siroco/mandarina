import { appendFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { estimateCost } from '../src/domain/pricing.js';
import type { UsageEntry } from '../src/domain/token-usage.js';
import { FsTranscriptReader, toMountedPath } from '../src/infrastructure/fs-transcript-reader.js';

let dir: string;
let file: string;
const reader = new FsTranscriptReader(undefined);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mandarina-incremental-'));
  file = join(dir, 's1.jsonl');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const line = (id: string, output: number, model = 'claude-sonnet-5') =>
  JSON.stringify({ type: 'assistant', timestamp: '2026-09-25T10:00:00.000Z', message: { id, model, usage: { output_tokens: output } } });

/** Coste deduplicado por message.id, como `costOf` de los Presupuestos. */
function cost(entries: UsageEntry[]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const e of entries) {
    if (seen.has(e.messageId)) continue;
    seen.add(e.messageId);
    total += estimateCost(e.model, e.usage) ?? 0;
  }
  return total;
}

async function full(): Promise<number> {
  const data = await new FsTranscriptReader(undefined).read(file);
  return cost([...data!.entries, ...data!.subagents.flatMap((s) => s.entries)]);
}
const incremental = async () => cost((await reader.readUsage(file)) ?? []);

describe('AC-102: lectura incremental del coste', () => {
  it('coincide con la lectura completa tras appends parciales, con una línea cortada a mitad', async () => {
    const a = line('a', 1000);
    const b = line('b', 2000);
    const cutAt = Math.floor(b.length / 2);

    writeFileSync(file, `${a}\n`);
    expect(await incremental()).toBeCloseTo(await full(), 10);

    appendFileSync(file, b.slice(0, cutAt)); // línea de b a medias
    expect(await incremental()).toBeCloseTo(await full(), 10);
    expect(await incremental()).toBeCloseTo(cost((await new FsTranscriptReader(undefined).read(file))!.entries), 10);

    appendFileSync(file, `${b.slice(cutAt)}\n${line('a', 5000)}\n${line('c', 300)}`); // a se repite; c sin salto final
    expect(await incremental()).toBeCloseTo(await full(), 10);

    appendFileSync(file, '\n');
    expect(await incremental()).toBeCloseTo(await full(), 10);
    expect(await incremental()).toBeGreaterThan(0);
  });

  it('no parte caracteres multibyte cortados en el límite de una lectura', async () => {
    const text = JSON.stringify({ type: 'user', message: { content: 'ñandú €' } });
    const bytes = Buffer.from(`${text}\n${line('a', 100)}\n`);
    const cut = bytes.indexOf(Buffer.from('ñ')) + 1; // a mitad de la ñ
    writeFileSync(file, bytes.subarray(0, cut));
    await incremental();
    appendFileSync(file, bytes.subarray(cut));
    expect(await incremental()).toBeCloseTo(await full(), 10);
    expect(await incremental()).toBeGreaterThan(0);
  });

  it('relee entero si el fichero se trunca o se reescribe', async () => {
    writeFileSync(file, `${line('a', 1000)}\n${line('b', 2000)}\n`);
    const before = await incremental();
    writeFileSync(file, `${line('z', 10)}\n`);
    expect(await incremental()).toBeCloseTo(await full(), 10);
    expect(await incremental()).toBeLessThan(before);

    // Mismo tamaño y otro contenido: solo lo delata el mtime.
    const same = `${line('y', 99)}\n`;
    expect(same.length).toBe(`${line('z', 10)}\n`.length);
    writeFileSync(file, same);
    utimesSync(file, new Date(), new Date(Date.now() + 5000));
    expect(await incremental()).toBeCloseTo(await full(), 10);
  });

  it('suma también los Subagentes y da undefined si no hay Transcript', async () => {
    writeFileSync(file, `${line('a', 1000)}\n`);
    mkdirSync(join(dir, 's1', 'subagents'), { recursive: true });
    const sub = join(dir, 's1', 'subagents', 'agent-x.jsonl');
    writeFileSync(sub, `${line('h', 2000)}\n`);
    expect(await incremental()).toBeCloseTo(await full(), 10);
    appendFileSync(sub, `${line('i', 500)}\n`);
    expect(await incremental()).toBeCloseTo(await full(), 10);
    expect(await reader.readUsage(join(dir, 'no-existe.jsonl'))).toBeUndefined();
  });

  it('lee por bloques un Transcript de más de 1 MiB con el mismo resultado que la lectura completa', async () => {
    const lines = Array.from({ length: 12000 }, (_, i) => line('m' + i, 100 + i));
    writeFileSync(file, lines.join('\n') + '\n');
    expect(lines.join('\n').length).toBeGreaterThan(1024 * 1024);
    expect(await incremental()).toBeCloseTo(await full(), 8);
  });

  it('relee entero un fichero sustituido por otro de mayor tamaño', async () => {
    writeFileSync(file, `${line('a', 1000)}\n`);
    await incremental();
    const other = join(dir, 'otro.jsonl');
    writeFileSync(other, `${line('x', 10)}\n${line('y', 20)}\n${line('z', 30)}\n`);
    rmSync(file);
    renameSync(other, file);
    expect(await incremental()).toBeCloseTo(await full(), 10);
  });

  it('la ruta del hook no puede salir del volumen montado con ..', () => {
    const mounted = toMountedPath('/home/dev/.claude/../../etc/passwd.jsonl', '/claude-home').replaceAll('\\', '/');
    expect(mounted).toContain('claude-home');
    expect(mounted).not.toContain('etc/passwd');
  });
});
