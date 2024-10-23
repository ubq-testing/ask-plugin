# `@ubiquity-os/command-ask` 

This is a highly context aware GitHub organization integrated bot that uses the OpenAI GPT-4o model to provide highly relevant answers to questions and queries in GitHub issues and pull requests.

## Usage

In any repository where your Ubiquity OS app is installed, both issues and pull requests alike, you simply mention `@UbiquityOS` with your question or query and using the latest OpenAi GPT-4o model, the bot will provide you with a highly relevant answer.

## How it works

With it's huge context window, we are able to feed the entire conversational history to the model which we obtain by recursively fetching any referenced issues or pull requests from the chat history. This allows the model to have a very deep understanding of the current scope and provide highly relevant answers.

As it receives everything from discussions to pull request diffs and review comments, it is a highly versatile and capable bot that can assist in a wide range of scenarios.

## Installation

`ubiquibot-config.yml`:

```yml
plugins:
  - uses:
      - plugin: http://localhost:4000
        with:
          model: ""
          openAiBaseUrl: ""
```

`.dev.vars` (for local testing):

```sh
# OpenAI API key
OPENAI_API_KEY=your-api-key
UBIQUITY_OS_APP_NAME="UbiquityOS"

```

## Testing

```sh
yarn test
```
