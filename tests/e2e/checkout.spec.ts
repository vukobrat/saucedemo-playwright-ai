import { readFile } from 'node:fs/promises';
import { test, expect } from '@fixtures';
import { CustomerBuilder } from '@data/builders/customer.builder';
import { KNOWN_BUGS } from '@data/known-bugs';
import { CHECKOUT_SUMMARY, ORDER_COMPLETE, PAGE_TITLES } from '@data/messages';
import { ALL_PRODUCTS, PRODUCTS } from '@data/products';
import { knownBug } from '@utils/known-bug';
import { orderTotals, summaryLines } from '@utils/pricing';

test.describe('Checkout', { tag: '@regression' }, () => {
  test(
    'completes a purchase end to end with the correct totals',
    { tag: '@smoke' },
    async ({
      inventoryPage,
      cartPage,
      checkoutInformationPage,
      checkoutOverviewPage,
      checkoutCompletePage,
      faker,
    }) => {
      const products = [PRODUCTS.backpack, PRODUCTS.fleeceJacket, PRODUCTS.onesie];
      const expected = summaryLines(orderTotals(products));
      await inventoryPage.goto();
      await inventoryPage.addToCart(...products);

      await inventoryPage.header.openCart();
      await cartPage.checkout();
      await checkoutInformationPage.expectLoaded();
      await expect(checkoutInformationPage.title).toHaveText(PAGE_TITLES.checkoutInformation);
      await checkoutInformationPage.submit(new CustomerBuilder(faker).build());

      await checkoutOverviewPage.expectLoaded();
      await expect(checkoutOverviewPage.title).toHaveText(PAGE_TITLES.checkoutOverview);
      await expect(checkoutOverviewPage.itemNames).toHaveText(products.map((p) => p.name));
      await expect(checkoutOverviewPage.paymentInfo).toHaveText(CHECKOUT_SUMMARY.payment);
      await expect(checkoutOverviewPage.shippingInfo).toHaveText(CHECKOUT_SUMMARY.shipping);
      await expect(checkoutOverviewPage.subtotal).toHaveText(expected.subtotal);
      await expect(checkoutOverviewPage.tax).toHaveText(expected.tax);
      await expect(checkoutOverviewPage.total).toHaveText(expected.total);

      await checkoutOverviewPage.finish();

      await checkoutCompletePage.expectLoaded();
      await expect(checkoutCompletePage.title).toHaveText(PAGE_TITLES.checkoutComplete);
      await expect(checkoutCompletePage.heading).toHaveText(ORDER_COMPLETE.heading);
      await expect(checkoutCompletePage.message).toHaveText(ORDER_COMPLETE.text);
    },
  );

  test('rounds tax correctly for a full cart', async ({
    inventoryPage,
    checkoutInformationPage,
    checkoutOverviewPage,
    faker,
  }) => {
    const expected = summaryLines(orderTotals(ALL_PRODUCTS));
    await inventoryPage.goto();
    await inventoryPage.addToCart(...ALL_PRODUCTS);
    await checkoutInformationPage.goto();

    await checkoutInformationPage.submit(new CustomerBuilder(faker).build());

    await expect(checkoutOverviewPage.items).toHaveCount(ALL_PRODUCTS.length);
    await expect(checkoutOverviewPage.subtotal).toHaveText(expected.subtotal);
    await expect(checkoutOverviewPage.tax).toHaveText(expected.tax);
    await expect(checkoutOverviewPage.total).toHaveText(expected.total);
  });

  test('cancel on the information step returns to the cart and keeps it', async ({
    inventoryPage,
    checkoutInformationPage,
    cartPage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart(PRODUCTS.bikeLight);
    await checkoutInformationPage.goto();

    await checkoutInformationPage.cancel();

    await cartPage.expectLoaded();
    await expect(cartPage.itemNames).toHaveText([PRODUCTS.bikeLight.name]);
  });

  test('cancel on the overview returns to the inventory and keeps the cart', async ({
    inventoryPage,
    checkoutInformationPage,
    checkoutOverviewPage,
    faker,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart(PRODUCTS.boltTShirt);
    await checkoutInformationPage.goto();
    await checkoutInformationPage.submit(new CustomerBuilder(faker).build());

    await checkoutOverviewPage.cancel();

    await inventoryPage.expectLoaded();
    await expect(inventoryPage.header.cartBadge).toHaveText('1');
  });

  test('a completed order empties the cart', async ({
    inventoryPage,
    checkoutInformationPage,
    checkoutOverviewPage,
    checkoutCompletePage,
    faker,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart(PRODUCTS.redTShirt);
    await checkoutInformationPage.goto();
    await checkoutInformationPage.submit(new CustomerBuilder(faker).build());
    await checkoutOverviewPage.finish();
    await expect(checkoutCompletePage.header.cartBadge).toBeHidden();

    await checkoutCompletePage.backHome();

    await inventoryPage.expectLoaded();
    await expect(inventoryPage.product(PRODUCTS.redTShirt).addToCartButton).toBeVisible();
  });

  test('the order can be downloaded as a PDF', async ({
    inventoryPage,
    checkoutInformationPage,
    checkoutOverviewPage,
    checkoutCompletePage,
    faker,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart(PRODUCTS.onesie);
    await checkoutInformationPage.goto();
    await checkoutInformationPage.submit(new CustomerBuilder(faker).build());
    await checkoutOverviewPage.finish();

    const download = await checkoutCompletePage.downloadOrderPdf();

    expect(download.suggestedFilename()).toMatch(
      /^swag-labs-order-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.pdf$/,
    );
    const pdf = await readFile(await download.path());
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  test('checkout is unavailable for an empty cart', async ({ cartPage }) => {
    knownBug(KNOWN_BUGS.checkoutWithEmptyCart);
    await cartPage.goto();
    await expect(cartPage.items).toHaveCount(0);

    // Expected behavior (product decision): no checkout without items.
    await expect(cartPage.checkoutButton).toBeDisabled();
  });
});
