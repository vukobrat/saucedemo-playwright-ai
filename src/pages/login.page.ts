import type { Locator, Page } from '@playwright/test';
import { env } from '@config/env';
import type { User } from '@data/users';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  protected readonly pathname = '/';
  protected readonly readyMarker: Locator;

  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  /** `role="alert"` banner shown above the login button. */
  readonly error: Locator;
  readonly dismissErrorButton: Locator;

  constructor(page: Page) {
    super(page);
    this.usernameInput = page.getByRole('textbox', { name: 'Username' });
    this.passwordInput = page.getByRole('textbox', { name: 'Password' });
    this.loginButton = page.getByRole('button', { name: 'Login', exact: true });
    this.error = page.getByTestId('error');
    this.dismissErrorButton = page.getByRole('button', { name: 'Dismiss error' });
    this.readyMarker = this.loginButton;
  }

  async goto(): Promise<void> {
    await this.page.goto(this.pathname);
  }

  /** Submits the form with raw values; use for negative cases such as empty fields. */
  async login(username: string, password: string): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  /** Logs in a demo user with the shared password from the environment. */
  async loginAs(user: User): Promise<void> {
    await this.login(user.username, env.saucePassword);
  }

  async dismissError(): Promise<void> {
    await this.dismissErrorButton.click();
  }
}
