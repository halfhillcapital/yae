// Learn more about clients at https://docs.boundaryml.com/docs/snippets/clients/overview

// Using the new OpenAI Responses API for enhanced formatting
client<llm> OpenRouter {
  provider openrouter
  retry_policy Exponential
  options {
    model "tngtech/tng-r1t-chimera:free"
  }
}

client<llm> VercelGateway {
  provider "openai-generic"
  options {
    base_url "https://ai-gateway.vercel.sh/v1"
    api_key env.VERCEL_GATEWAY_API_KEY
    // Example models routed via the gateway
    // model "anthropic/claude-3-5-sonnet-latest"
    // model "openai/gpt-5-mini"
  }
}

client<llm> LMStudio {
  provider "openai-generic"
  options {
    base_url "http://localhost:11434/v1"
    model "unsloth/gemma-3-12b-it"
  }
}

retry_policy Exponential {
  max_retries 2
  strategy {
    type exponential_backoff
    delay_ms 300
    multiplier 1.5
    max_delay_ms 10000
  }
}