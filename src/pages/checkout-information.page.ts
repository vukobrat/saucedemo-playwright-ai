import type { Locator, Page } from '@playwright/test';
import type { Customer } from '@data/builders/customer.builder';
import { AppPage } from './app.page';

/** Checkout step one: "Your Information". */
export class CheckoutInformationPage extends AppPage {
  protected readonly pathname = '/checkout-step-one.html';
  protected readonly readyMarker: Locator;

  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly postalCodeInput: Locator;
  readonly continueButton: Locator;
  readonly cancelButton: Locator;
  readonly error: Locator;

  constructor(page: Page) {
    super(page);
    this.firstNameInput = page.getByRole('textbox', { name: 'First Name' });
    this.lastNameInput = page.getByRole('textbox', { name: 'Last Name' });
    this.postalCodeInput = page.getByRole('textbox', { name: 'Zip/Postal Code' });
    this.continueButton = page.getByRole('button', { name: 'Continue' });
    this.cancelButton = page.getByRole('button', { name: 'Cancel' });
    this.error = page.getByTestId('error');
    this.readyMarker = page.getByTestId('checkout-info-container');
  }

  async goto(): Promise<void> {
    await this.page.goto(this.pathname);
  }

  async fill(customer: Customer): Promise<void> {
    await this.firstNameInput.fill(customer.firstName);
    await this.lastNameInput.fill(customer.lastName);
    await this.postalCodeInput.fill(customer.postalCode);
  }

  async submit(customer: Customer): Promise<void> {
    await this.fill(customer);
    await this.continueButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }
}
