import os

from yae.errors import MissingEnvironmentVariableError


def required_env(key: str, default: str | None = None) -> str:
    """
    Gets an environment variable or raises a custom error if it's not set.

    Args:
        key: The name of the environment variable.
        default: The default value to return if the environment variable is not found.

    Returns:
        The value of the environment variable as a string.

    Raises:
        MissingEnvironmentVariableError: If the environment variable is not found.
    """
    value = os.getenv(key)
    if value is None:
        if default is None:
            raise MissingEnvironmentVariableError(key)
        return default
    return value

def required_prompts(file: str) -> str:
    """
    Reads the content of a markdown file in the prompts folder.

    Args:
        file: The name of the prompt file.
    Returns:
        The content of the file as a string.
    """
    filepath = os.path.join(os.getcwd(), "prompts", file)
    with open(filepath, "r") as f:
        return f.read()

async def stream_text(content: str):
    yield content
