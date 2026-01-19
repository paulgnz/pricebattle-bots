#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig, validateConfig } from './config';
import { PriceBattleBot } from './bot';
import { initDatabase, DatabaseQueries } from './db';
import { RpcClient } from './blockchain';
import { OracleService, ChallengeService } from './services';
import { BotMode } from './types';
import { formatUSD, formatDuration, todayDate } from './utils';

const program = new Command();

program
  .name('pricebattle-bot')
  .description('PriceBattle trading and resolver bot for XPR Network')
  .version('1.0.0');

// Start command
program
  .command('start')
  .description('Start the bot')
  .option('-m, --mode <mode>', 'Bot mode: resolver, passive, aggressive', 'resolver')
  .option('--dry-run', 'Run without executing transactions')
  .action(async (options) => {
    try {
      const mode = options.mode as BotMode;
      if (!['resolver', 'passive', 'aggressive'].includes(mode)) {
        console.error(`Invalid mode: ${mode}. Must be resolver, passive, or aggressive.`);
        process.exit(1);
      }

      const config = loadConfig({ mode, dryRun: options.dryRun || false });
      validateConfig(config);

      const bot = new PriceBattleBot(config);

      // Graceful shutdown
      const shutdown = async () => {
        console.log('\nShutting down...');
        await bot.stop();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      await bot.start();

      // Keep process running
      console.log('\nBot is running. Press Ctrl+C to stop.\n');
    } catch (error) {
      console.error('Failed to start bot:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show bot status and performance')
  .action(async () => {
    try {
      const config = loadConfig();

      const dbInstance = await initDatabase(config.databasePath);
      const db = new DatabaseQueries(dbInstance, config.databasePath);
      const rpc = new RpcClient(config.endpoints);

      const [balance] = await rpc.getCurrencyBalance('eosio.token', config.account, 'XPR');
      const todayPerf = db.getPerformance(todayDate());
      const totalPerf = db.getTotalPerformance();

      console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    PriceBattle Bot Status                    ║
╠══════════════════════════════════════════════════════════════╣
║  Account:        ${config.account.padEnd(42)} ║
║  Balance:        ${(balance || '0.0000 XPR').padEnd(42)} ║
║  Network:        ${config.chain.padEnd(42)} ║
╠══════════════════════════════════════════════════════════════╣
║                    Today's Performance                       ║
╠══════════════════════════════════════════════════════════════╣
║  Wins:           ${String(todayPerf.wins).padEnd(42)} ║
║  Losses:         ${String(todayPerf.losses).padEnd(42)} ║
║  Ties:           ${String(todayPerf.ties).padEnd(42)} ║
║  Win Rate:       ${(todayPerf.winRate.toFixed(1) + '%').padEnd(42)} ║
║  P&L:            ${((todayPerf.totalWon - todayPerf.totalLost).toFixed(4) + ' XPR').padEnd(42)} ║
╠══════════════════════════════════════════════════════════════╣
║                    All-Time Performance                      ║
╠══════════════════════════════════════════════════════════════╣
║  Total Wins:     ${String(totalPerf.wins).padEnd(42)} ║
║  Total Losses:   ${String(totalPerf.losses).padEnd(42)} ║
║  Total Ties:     ${String(totalPerf.ties).padEnd(42)} ║
║  Win Rate:       ${(totalPerf.winRate.toFixed(1) + '%').padEnd(42)} ║
║  Total P&L:      ${((totalPerf.totalWon - totalPerf.totalLost).toFixed(4) + ' XPR').padEnd(42)} ║
║  Resolver Fees:  ${(totalPerf.resolverEarnings.toFixed(4) + ' XPR').padEnd(42)} ║
╚══════════════════════════════════════════════════════════════╝
      `);
    } catch (error) {
      console.error('Failed to get status:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Resolve command
program
  .command('resolve')
  .description('Manually resolve all resolvable battles')
  .option('--dry-run', 'Show what would be resolved without executing')
  .action(async (options) => {
    try {
      const config = loadConfig({ dryRun: options.dryRun || false });
      validateConfig(config);

      const rpc = new RpcClient(config.endpoints);
      const dbInstance = await initDatabase(config.databasePath);
      const db = new DatabaseQueries(dbInstance, config.databasePath);
      const challengeService = new ChallengeService(rpc, db, config.account);

      console.log('Checking for resolvable battles...\n');

      const resolvable = await challengeService.getResolvableChallenges();

      if (resolvable.length === 0) {
        console.log('No battles to resolve.');
        return;
      }

      console.log(`Found ${resolvable.length} resolvable battle(s):\n`);

      for (const c of resolvable) {
        console.log(`  Battle #${c.id}`);
        console.log(`    Creator: ${c.creator} (${c.direction === 1 ? 'UP' : 'DOWN'})`);
        console.log(`    Opponent: ${c.opponent}`);
        console.log(`    Amount: ${(parseInt(c.amount, 10) / 10000).toFixed(4)} XPR each`);
        console.log(`    Duration: ${formatDuration(c.duration)}`);
        console.log('');
      }

      if (options.dryRun) {
        console.log('[DRY RUN] Would resolve these battles.');
      } else {
        // Create bot and run manual resolve
        const bot = new PriceBattleBot({ ...config, mode: 'resolver' });
        await bot.manualResolve();
      }
    } catch (error) {
      console.error('Failed to resolve:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// History command
program
  .command('history')
  .description('Show decision history')
  .option('-n, --limit <number>', 'Number of records to show', '20')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const dbInstance = await initDatabase(config.databasePath);
      const db = new DatabaseQueries(dbInstance, config.databasePath);

      const decisions = db.getRecentDecisions(parseInt(options.limit, 10));

      if (decisions.length === 0) {
        console.log('No decisions recorded yet.');
        return;
      }

      console.log('\nRecent Decisions:\n');
      console.log('ID\tAction\t\tDirection\tConfidence\tPrice\t\tTime');
      console.log('─'.repeat(80));

      for (const d of decisions) {
        console.log(
          `${d.id}\t${d.action.padEnd(12)}\t${(d.direction || '-').padEnd(8)}\t${
            d.confidence !== null ? d.confidence + '%' : '-'
          }\t\t${d.price_at_decision ? formatUSD(d.price_at_decision) : '-'}\t${d.created_at}`
        );
      }
    } catch (error) {
      console.error('Failed to get history:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Price command
program
  .command('price')
  .description('Show current BTC price from oracle')
  .action(async () => {
    try {
      const config = loadConfig();
      const rpc = new RpcClient(config.endpoints);
      const oracle = new OracleService(rpc);

      const { price } = await oracle.getBTCPrice();
      console.log(`\nCurrent BTC Price: ${formatUSD(price)}\n`);
    } catch (error) {
      console.error('Failed to get price:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Challenges command
program
  .command('challenges')
  .description('Show open and active challenges')
  .action(async () => {
    try {
      const config = loadConfig();
      const rpc = new RpcClient(config.endpoints);
      const dbInstance = await initDatabase(config.databasePath);
      const db = new DatabaseQueries(dbInstance, config.databasePath);
      const challengeService = new ChallengeService(rpc, db, config.account);

      const [open, active] = await Promise.all([
        challengeService.getOpenChallenges(),
        challengeService.getActiveChallenges(),
      ]);

      console.log(`\n=== Open Challenges (${open.length}) ===\n`);
      if (open.length === 0) {
        console.log('  No open challenges.');
      } else {
        for (const c of open) {
          const expiresIn = c.expires_at - Math.floor(Date.now() / 1000);
          console.log(`  #${c.id}: ${c.creator} bets ${c.direction === 1 ? 'UP' : 'DOWN'}`);
          console.log(`      Amount: ${(parseInt(c.amount, 10) / 10000).toFixed(4)} XPR`);
          console.log(`      Duration: ${formatDuration(c.duration)}`);
          console.log(`      Expires: ${expiresIn > 0 ? formatDuration(expiresIn) : 'Expired'}`);
          console.log('');
        }
      }

      console.log(`\n=== Active Battles (${active.length}) ===\n`);
      if (active.length === 0) {
        console.log('  No active battles.');
      } else {
        for (const c of active) {
          const endTime = c.started_at + c.duration;
          const remaining = endTime - Math.floor(Date.now() / 1000);
          console.log(`  #${c.id}: ${c.creator} vs ${c.opponent}`);
          console.log(`      Creator: ${c.direction === 1 ? 'UP' : 'DOWN'} | Opponent: ${c.direction === 1 ? 'DOWN' : 'UP'}`);
          console.log(`      Amount: ${(parseInt(c.amount, 10) / 10000).toFixed(4)} XPR each`);
          console.log(`      Remaining: ${remaining > 0 ? formatDuration(remaining) : 'Ready to resolve'}`);
          console.log('');
        }
      }
    } catch (error) {
      console.error('Failed to get challenges:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
