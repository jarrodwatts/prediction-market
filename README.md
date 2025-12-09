# Prediction Market

An open source prediction market platform built with Next.js and smart contracts.

## Features

- **Next.js 16** with App Router
- **Tailwind CSS v4** with OKLCH color system
- **shadcn/ui** components (New York style)
- **Dark mode** via next-themes (dark by default)
- **TypeScript** configured
- **Smart Contracts** in `/contracts` directory

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

## Project Structure

```
├── app/
│   ├── globals.css      # Theme & CSS variables
│   ├── layout.tsx       # Root layout with providers
│   └── page.tsx         # Home page
├── components/
│   ├── header.tsx       # Navigation header
│   ├── theme-provider.tsx
│   └── ui/              # UI components
├── contracts/           # Smart contracts
├── lib/
│   └── utils.ts         # cn() helper
└── components.json      # shadcn config
```

## Adding Components

Add shadcn components:

```bash
pnpm dlx shadcn@latest add card input dialog
```

## Customization

1. **Colors:** Edit CSS variables in `app/globals.css`
2. **Fonts:** Change imports in `app/layout.tsx`
3. **Theme:** Modify ThemeProvider props in `app/layout.tsx`

## License

MIT
