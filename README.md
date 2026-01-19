# PriceBattle Bots

An open-source Node.js trading and resolver bot for the [PriceBattle](https://proton.link/battle) game on XPR Network (Proton blockchain).

## Features

- **Resolver Mode** - Earn 2% fees by resolving ended battles
- **Passive Trading** - Conservative AI-powered trading with high confidence thresholds
- **Aggressive Trading** - Active AI-powered trading to maximize profits
- **AI Integration** - Supports Claude (Anthropic) or OpenAI for market analysis
- **Risk Management** - Configurable stake limits, concurrent challenge caps, and daily loss limits
- **SQLite Database** - Tracks price history, decisions, and performance

## Quick Start

### 1. Installation

```bash
git clone https://github.com/paulgnz/pricebattle-bots.git
cd pricebattle-bots
npm install
```

### 2. Configuration

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```bash
# Required
PRIVATE_KEY=PVT_K1_your_private_key_here
ACCOUNT_NAME=youraccount

# AI (required for passive/aggressive modes)
AI_PROVIDER=claude
CLAUDE_API_KEY=sk-ant-api03-xxx
```

### 3. Build

```bash
npm run build
```

### 4. Run

```bash
# Resolver mode (zero risk - just earn fees)
npm start -- start --mode resolver

# Passive trading (conservative, high-confidence only)
npm start -- start --mode passive

# Aggressive trading (active, lower thresholds)
npm start -- start --mode aggressive

# Dry run (no actual transactions)
npm start -- start --mode passive --dry-run
```

## CLI Commands

### Start the Bot

```bash
pricebattle-bot start [options]

Options:
  -m, --mode <mode>  Bot mode: resolver, passive, aggressive (default: resolver)
  --dry-run          Run without executing transactions
```

### Check Status

```bash
pricebattle-bot status
```

Shows account balance, today's performance, and all-time stats.

### Manual Resolve

```bash
pricebattle-bot resolve [--dry-run]
```

Manually check and resolve all resolvable battles.

### View Challenges

```bash
pricebattle-bot challenges
```

Shows open challenges and active battles.

### Check Price

```bash
pricebattle-bot price
```

Shows current BTC price from the oracle.

### Decision History

```bash
pricebattle-bot history [-n <limit>]
```

Shows recent AI decisions and actions.

## Bot Modes

### Resolver Mode (Zero Risk)

The safest mode - the bot only resolves ended battles to earn the 2% resolver fee. It never creates or accepts challenges.

```bash
npm start -- start --mode resolver
```

**Earnings**: 2% of every battle pot you resolve (e.g., 20 XPR on a 500+500 battle)

### Passive Mode (Conservative)

Uses AI to analyze the market but only trades when confidence is high (>=75%). Uses conservative stake sizes.

```bash
npm start -- start --mode passive
```

**Risk Management**:
- Only trades with 75%+ AI confidence
- Maximum 3% stake per challenge
- Respects all configured limits

### Aggressive Mode (Active Trading)

Trades more actively with lower confidence thresholds (>=50%). Uses higher stakes to maximize profits.

```bash
npm start -- start --mode aggressive
```

**Risk Management**:
- Trades with 50%+ AI confidence
- Uses AI-recommended stakes (up to configured max)
- Stops trading if daily loss limit reached

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PRIVATE_KEY` | Yes | - | Proton account private key |
| `ACCOUNT_NAME` | Yes | - | Proton account name |
| `PERMISSION` | No | active | Permission level |
| `CHAIN` | No | proton | Network (proton or proton-test) |
| `AI_PROVIDER` | For trading | claude | AI provider (claude or openai) |
| `CLAUDE_API_KEY` | If claude | - | Anthropic API key |
| `OPENAI_API_KEY` | If openai | - | OpenAI API key |
| `MAX_PERCENT_PER_CHALLENGE` | No | 5 | Max % of balance per bet |
| `MAX_CONCURRENT_CHALLENGES` | No | 3 | Max active challenges |
| `MIN_BALANCE_RESERVE` | No | 100 | Keep X XPR in reserve |
| `MAX_DAILY_LOSS` | No | 500 | Stop trading if loss exceeds |
| `LOG_LEVEL` | No | info | Logging level |

### Polling Intervals

| Variable | Default | Description |
|----------|---------|-------------|
| `PRICE_CHECK_INTERVAL` | 60000 | Price recording interval (ms) |
| `CHALLENGE_MONITOR_INTERVAL` | 30000 | Challenge sync interval (ms) |
| `RESOLVER_CHECK_INTERVAL` | 15000 | Resolution check interval (ms) |

## How It Works

### PriceBattle Game

1. **Create Challenge**: Player stakes XPR and predicts BTC direction (UP/DOWN)
2. **Accept Challenge**: Opponent matches stake and takes opposite side (price locked from oracle)
3. **Battle Period**: Wait for the duration (5min to 24h)
4. **Resolution**: Anyone can resolve after time ends (price fetched from oracle)
5. **Payout**: Winner gets 95%, resolver gets 2%, treasury gets 3%

**Note**: The contract fetches BTC prices directly from the XPR Network oracle (`oracles` contract, feed index 4) to ensure price integrity. Prices cannot be manipulated by users.

### Bot Strategy

1. **Price Tracking**: Records BTC price every minute for analysis
2. **AI Analysis**: Uses Claude or GPT to analyze market conditions
3. **Decision Making**: Creates/accepts challenges based on confidence
4. **Resolution**: Automatically resolves all ended battles for fees
5. **Risk Management**: Respects configured limits and stops on loss

### AI Prompts

The bot provides the AI with:
- Current BTC price
- Recent price history (30 data points)
- 1h/24h price changes
- Bot's historical performance

AI returns:
- Direction prediction (UP/DOWN/NEUTRAL)
- Confidence level (0-100%)
- Recommended duration
- Suggested stake percentage
- Brief reasoning

## Database

SQLite database stores:

- **price_history**: BTC price at 1-minute intervals
- **challenges**: Tracked challenges from blockchain
- **decisions**: AI decision log with reasoning
- **performance**: Daily win/loss/profit tracking

Database location: `./data/pricebattle.db`

## Development

```bash
# Run in development mode
npm run dev -- start --mode resolver

# Build
npm run build

# Run tests
npm test
```

## Security

### IMPORTANT: Use a Dedicated Bot Account

**DO NOT use your main XPR wallet with this bot.** The bot has full control over the account and will automatically create/accept challenges and transfer XPR.

**Create a new account specifically for the bot:**

1. **Create a new Proton account** at [webauth.com](https://webauth.com)
2. **Save your mnemonic** (12 words) - you'll need this to get the private key
3. **Convert mnemonic to Private Key**:
   - Go to [XPR Explorer Format Keys](https://explorer.xprnetwork.org/wallet/utilities/format-keys)
   - Enter your 12-word mnemonic phrase
   - Copy the **Private Key** (starts with `PVT_K1_`)
4. **Fund with spare XPR** - send only what you're willing to risk to your new account
5. **Add the private key to `.env`**

### Best Practices

- **Private Key**: Store securely in `.env` (never commit!)
- **Dry Run**: Always test with `--dry-run` first
- **Testnet**: Test on proton-test before mainnet
- **Limits**: Configure conservative limits initially
- **Separate Account**: Never use your main wallet - the AI controls this account!
- **Start Small**: Fund with a small amount first to test

## License

MIT

## Disclaimer

This bot is for educational purposes. Trading involves risk. Use at your own discretion. The authors are not responsible for any financial losses.
