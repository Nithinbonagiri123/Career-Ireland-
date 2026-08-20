export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super('VALIDATION_ERROR', message);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Not authenticated') {
    super('AUTHENTICATION_ERROR', message);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Not authorized') {
    super('AUTHORIZATION_ERROR', message);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string) {
    super('NOT_FOUND', `${entity} not found`);
  }
}

export class BusinessRuleError extends AppError {}
