class MissingEnvironmentVariableError(Exception):
    """Custom exception for a required environment variable that is not set."""

    def __init__(self, key: str):
        self.key: str = key
        super().__init__(f"Required environment variable '{key}' is not set.")
