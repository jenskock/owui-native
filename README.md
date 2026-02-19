# OWUI Native - Native iOS Client

A React Native iOS client for [OWUI Native](https://github.com/open-webui/open-webui), built with best practices.

## Features

- **Authentication** – OWUI Native native auth (username/password, no SSO)
- **Chats** – Access all your chats and create new ones
- **Model selection** – Choose from available models on your instance
- **Response streaming** – Real-time streaming responses
- **File upload** – Attach files to messages (images, documents)

## Requirements

- Node.js >= 22.11 (22 LTS recommended; Node 23 may show engine warnings from some ESLint dev deps)
- Xcode (for iOS)
- CocoaPods
- iOS Simulator or physical device

## Setup

```bash
# Install dependencies
npm install

# iOS: Install CocoaPods
cd ios && pod install && cd ..

# Start Metro bundler
npm start

# Run on iOS (in another terminal)
npm run ios
```

## Configuration

1. **Login** – Enter your OWUI Native instance URL (e.g. `https://openwebui.example.com`), username, and password.
2. **Instance URL** – Must use HTTPS for production. Local development with `http://localhost` may require ATS exceptions.

## Project Structure

``` text
src/
├── api/           # OWUI Native API client
├── constants/     # App constants
├── contexts/     # Auth context
├── navigation/   # Navigation types
├── screens/      # Login, Chats, Chat
└── types/        # TypeScript types
```

## API Compatibility

Built for OWUI Native API:

- `POST /api/v1/auths/signin` – Authentication
- `GET /api/chats` – List chats
- `POST /api/chats` – Create chat
- `GET /api/chats/:id` – Get chat with messages
- `GET /api/models` – List models
- `POST /api/chat` – Chat completion (streaming)

## License

MIT
