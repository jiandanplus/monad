import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import solc from 'solc';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function compile() {
  if (!solc.version().startsWith('0.8.30+')) throw new Error('Expected pinned Solidity 0.8.30 compiler');
  const source = await readFile(resolve(root, 'contracts/SiegeCanvas.sol'), 'utf8');
  const settings = { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: 'shanghai', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } };
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'SiegeCanvas.sol': { content: source } }, settings })));
  const errors = (output.errors ?? []).filter((item) => item.severity === 'error');
  if (errors.length) throw new Error(errors.map((item) => item.formattedMessage).join('\n'));
  const contract = output.contracts['SiegeCanvas.sol'].SiegeCanvas;
  const artifact = { contractName: 'SiegeCanvas', compiler: solc.version(), settings: { optimizer: settings.optimizer, viaIR: settings.viaIR, evmVersion: settings.evmVersion }, sourceHash: `sha256:${createHash('sha256').update(source).digest('hex')}`, abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}`, deployedBytecode: `0x${contract.evm.deployedBytecode.object}` };
  await mkdir(resolve(root, 'src/generated'), { recursive: true });
  await writeFile(resolve(root, 'src/generated/SiegeCanvas.json'), JSON.stringify(artifact, null, 2) + '\n');
  return artifact;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const artifact = await compile();
  console.log(`Compiled ${artifact.contractName} with ${artifact.compiler}; ${artifact.settings.evmVersion}, viaIR ${artifact.settings.viaIR}, optimizer 200 runs; ${(artifact.bytecode.length - 2) / 2} deployment bytes.`);
}
