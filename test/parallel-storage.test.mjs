import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { createPublicClient, createWalletClient, custom } from 'viem';
import { compile } from '../scripts/compile.mjs';

const artifact = compile();

async function setup(t) {
  const { abi, bytecode } = await artifact;
  const provider = ganache.provider({
    logging: { quiet: true },
    chain: { hardfork: 'shanghai', time: new Date(1000000) },
    miner: { timestampIncrement: 0 },
    wallet: { totalAccounts: 2 },
  });
  t.after(() => provider.disconnect());
  const client = createPublicClient({ transport: custom(provider) });
  const wallet = createWalletClient({ transport: custom(provider) });
  const [team1, team2] = await wallet.getAddresses();
  assert.notEqual(team1, team2);
  const deployed = await client.waitForTransactionReceipt({
    hash: await wallet.deployContract({ abi, bytecode, account: team1, chain: null, gas: 6000000n }),
  });
  assert.equal(deployed.status, 'success');
  const address = deployed.contractAddress;
  const send = async (functionName, args, account = team1) => {
    const receipt = await client.waitForTransactionReceipt({
      hash: await wallet.writeContract({ address, abi, functionName, args, account, chain: null, gas: 2000000n }),
    });
    assert.equal(receipt.status, 'success');
    return receipt;
  };
  const snapshot = () => client.readContract({ address, abi, functionName: 'getSnapshot', args: [team1] });
  const at = async timestamp => {
    await provider.request({ method: 'evm_setTime', params: [Number(timestamp) * 1000] });
    await provider.request({ method: 'evm_mine', params: [] });
  };
  await send('startRound', [0n]);
  return { provider, team1, team2, send, snapshot, at };
}

async function storageAccess(provider, receipt) {
  const trace = await provider.request({
    method: 'debug_traceTransaction',
    params: [receipt.transactionHash, { disableMemory: true, disableStorage: true }],
  });
  assert.ok(trace.structLogs.length > 0, 'trace must contain executed EVM instructions');
  const reads = new Set();
  const writes = new Set();
  for (const step of trace.structLogs) {
    if (step.op !== 'SLOAD' && step.op !== 'SSTORE') continue;
    assert.ok(step.stack?.length > 0, 'storage instructions need their actual stack key');
    // Include every observed storage access. This contract makes no external calls;
    // no application slots or opcodes are filtered out to manufacture independence.
    assert.equal(step.depth, 1);
    const key = `0x${step.stack.at(-1).replace(/^0x/, '').padStart(64, '0')}`;
    (step.op === 'SLOAD' ? reads : writes).add(key);
  }
  assert.ok(reads.size > 0);
  assert.ok(writes.size > 0);
  return { reads, writes };
}

function conflicts(first, second) {
  const writesAgainst = (writer, other) => [...writer.writes]
    .filter(key => other.reads.has(key) || other.writes.has(key)).sort();
  return {
    firstWritesAgainstSecond: writesAgainst(first, second),
    secondWritesAgainstFirst: writesAgainst(second, first),
  };
}

async function opposingInfantry(t, game) {
  const firstReceipt = await game.send('cast', [1n, 1, 1, 0], game.team1);
  const secondReceipt = await game.send('cast', [1n, 7, 2, 0], game.team2);
  const first = await storageAccess(game.provider, firstReceipt);
  const second = await storageAccess(game.provider, secondReceipt);
  t.diagnostic(JSON.stringify({
    first: { reads: [...first.reads].sort(), writes: [...first.writes].sort() },
    second: { reads: [...second.reads].sort(), writes: [...second.writes].sort() },
    conflicts: conflicts(first, second),
  }));
  return { first, second };
}

test('real EVM traces: different-address opposing noncapture infantry have no symmetric storage conflicts', async t => {
  const game = await setup(t);
  const { first, second } = await opposingInfantry(t, game);
  const snapshot = await game.snapshot();
  assert.equal(snapshot[0], 1n);
  assert.deepEqual([snapshot[3][1], snapshot[3][7]], [0, 0]);
  assert.deepEqual([snapshot[4][1], snapshot[4][7]], [2, 2]);
  assert.deepEqual([snapshot[5][1], snapshot[5][7]], [1, 1]);
  assert.deepEqual([snapshot[6][1], snapshot[6][7]], [1, 1]);
  assert.deepEqual(conflicts(first, second), {
    firstWritesAgainstSecond: [],
    secondWritesAgainstFirst: [],
  });
});

test('real EVM traces: distinct-target captures retain legitimate ownership dependencies', async t => {
  const game = await setup(t);
  await opposingInfantry(t, game);
  const before = await game.snapshot();
  await game.at(before[1] + 2n);
  const { first, second } = await opposingInfantry(t, game);
  const after = await game.snapshot();
  assert.deepEqual([after[3][1], after[3][7]], [1, 2]);
  assert.deepEqual([after[4][1], after[4][7]], [16, 16]);
  const overlap = conflicts(first, second);
  assert.ok(overlap.firstWritesAgainstSecond.length > 0, 'capture ownership is read by subsequent score/reach checks');
  assert.ok(overlap.secondWritesAgainstFirst.length > 0, 'both directions must retain ownership dependencies');
});
