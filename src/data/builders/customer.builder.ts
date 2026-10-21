import type { Faker } from '@faker-js/faker';

/** Checkout "Your Information" form data. */
export interface Customer {
  readonly firstName: string;
  readonly lastName: string;
  readonly postalCode: string;
}

/**
 * Builds checkout customers with realistic random values. Pass the per-test `faker` fixture:
 * it is seeded from the test id, so a failing test reproduces with the same data.
 */
export class CustomerBuilder {
  private customer: Customer;

  constructor(faker: Faker) {
    this.customer = {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      postalCode: faker.location.zipCode(),
    };
  }

  with(overrides: Partial<Customer>): this {
    this.customer = { ...this.customer, ...overrides };
    return this;
  }

  withoutFirstName(): this {
    return this.with({ firstName: '' });
  }

  withoutLastName(): this {
    return this.with({ lastName: '' });
  }

  withoutPostalCode(): this {
    return this.with({ postalCode: '' });
  }

  build(): Customer {
    return { ...this.customer };
  }
}
