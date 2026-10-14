"""Safe errors: do not include upstream bodies, credential values or URLs."""


class PipelineError(Exception):
    def __init__(self, code: str, message: str, *, retryable=False):
        super().__init__(message)
        self.code, self.message, self.retryable = code, message, retryable

