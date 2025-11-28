# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SmartWallet (智能记账) is a React-based personal finance tracking application with AI-powered financial advice. The application features a minimalist Chinese interface design with comprehensive transaction management, statistical analysis, and intelligent financial insights.

## Development Commands

### Core Development
- `npm install` - Install dependencies
- `npm run dev` - Start development server (runs on port 3000)
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Environment Setup
- Create `.env.local` file with `GEMINI_API_KEY` to enable AI advisor functionality
- The app supports both Google Gemini API and OpenAI-compatible APIs for AI features

## Architecture Overview

### State Management Pattern
The application uses a centralized state management approach in the main `App.tsx` component:
- All transactions, categories, and recurring profiles are stored in React state
- Data persistence is handled via localStorage with automatic save/load on mount/changes
- State updates flow down through props to child components

### Core Data Models
Located in `types.ts`:
- `Transaction` - Individual income/expense records with category, date, and notes
- `Category` - Configurable categories with icons, colors, and types (income/expense)
- `RecurringProfile` - Automated recurring transaction rules with frequency settings
- `AppTab` - Enum for main navigation sections

### Key Application Features

#### 1. Tab-Based Navigation
Four main sections managed via `AppTab` enum:
- **DASHBOARD** (`我的账本`) - Main transaction view with monthly filtering
- **STATS** (`统计分析`) - Charts and financial analytics using Recharts
- **ADVISOR** (`智能顾问`) - AI-powered financial advice via Gemini/OpenAI APIs
- **SETTINGS** (`设置`) - Data management, recurring transactions, and AI configuration

#### 2. Transaction Management
- Add/edit/delete transactions with category assignment
- Monthly view with date grouping and daily summaries
- Recurring transaction automation with configurable frequencies
- Transaction editing with modal interface

#### 3. AI Integration
- Default integration with Google Gemini API (`gemini-2.5-flash` model)
- Custom AI configuration support for OpenAI-compatible APIs
- Context-aware financial advice based on transaction history
- Fallback handling for API failures

#### 4. Data Persistence
- All data stored in localStorage under `smartwallet_*` keys
- Automatic recurring transaction processing on app load
- Import/export functionality for data backup and migration

### Component Structure

#### Main Components
- `App.tsx` - Root component with centralized state and navigation logic
- `Dashboard.tsx` - Transaction list view with monthly filtering and grouping
- `Stats.tsx` - Statistical charts and financial analysis
- `Advisor.tsx` - AI chat interface for financial advice
- `Settings.tsx` - Configuration and data management
- `AddTransaction.tsx` - Modal form for adding/editing transactions

#### Shared Resources
- `constants.ts` - Default categories, icon mappings, and color palettes
- `types.ts` - TypeScript type definitions
- `services/geminiService.ts` - AI API integration layer

### Styling and Design
- Uses Tailwind CSS via CDN for styling
- Custom color scheme defined in `index.html` with Zinc-based palette
- Minimalist design with smooth animations and mobile-optimized interface
- Chinese language interface throughout the application

### Build Configuration
- Vite as the build tool and development server
- React 19 with TypeScript support
- Path aliasing configured (`@/*` maps to root directory)
- Environment variable injection for API keys

### Import Maps
The application uses import maps for dependency loading from CDN:
- Dependencies are loaded from `aistudiocdn.com` for optimized loading
- Supports hot module replacement in development

## Development Notes

### Adding New Features
- Follow the existing prop-drilling pattern from App.tsx
- Use the established color scheme and typography from index.html
- Implement proper TypeScript types for any new data structures
- Ensure mobile responsiveness and Chinese language support

### AI Integration
- The AI service supports both default Gemini and custom OpenAI-compatible APIs
- Configuration is stored in localStorage under `smartwallet_ai_config`
- Always provide fallback handling for API failures
- Include transaction context in AI requests for personalized advice

### Data Management
- All localStorage operations include error handling with try-catch blocks
- Recurring transactions are processed automatically on app initialization
- Data import/export supports both append and overwrite modes with user confirmation