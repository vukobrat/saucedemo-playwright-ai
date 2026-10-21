import { z } from 'zod';

/**
 * Consumer contracts for the DummyJSON endpoints this suite uses, verified against the live API.
 * Objects strip unknown keys: new provider fields do not break the contract, missing or
 * mistyped fields do.
 */

export const ErrorResponseSchema = z.object({ message: z.string().min(1) });

export const TokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

export const UserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1),
  email: z.email(),
  firstName: z.string(),
  lastName: z.string(),
  gender: z.string(),
  image: z.url(),
});

export const LoginResponseSchema = TokensSchema.extend(UserSchema.shape);

export const ProductSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string(),
  category: z.string().min(1),
  price: z.number().positive(),
  discountPercentage: z.number().min(0).max(100),
  rating: z.number().min(0).max(5),
  stock: z.number().int().min(0),
  tags: z.array(z.string()),
  brand: z.string().optional(),
  sku: z.string().min(1),
  thumbnail: z.url(),
  images: z.array(z.url()),
});

export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    products: z.array(item),
    total: z.number().int().min(0),
    skip: z.number().int().min(0),
    limit: z.number().int().min(0),
  });

export const ProductPageSchema = pageOf(ProductSchema);

const cartLineBase = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  price: z.number().positive(),
  quantity: z.number().int().positive(),
  total: z.number().min(0),
  discountPercentage: z.number().min(0).max(100),
  thumbnail: z.url(),
});

// The provider names the discounted line amount differently per endpoint (known bug DJ-002),
// so each endpoint gets its own, accurate contract.
export const AddedCartLineSchema = cartLineBase.extend({ discountedPrice: z.number().min(0) });
export const StoredCartLineSchema = cartLineBase.extend({ discountedTotal: z.number().min(0) });

const cartOf = <T extends z.ZodType>(line: T) =>
  z.object({
    id: z.number().int().positive(),
    products: z.array(line),
    total: z.number().min(0),
    discountedTotal: z.number().min(0),
    userId: z.number().int().positive(),
    totalProducts: z.number().int().min(0),
    totalQuantity: z.number().int().min(0),
  });

/** Response of POST /carts/add. */
export const AddedCartSchema = cartOf(AddedCartLineSchema);
/** Response of GET /carts/{id}. */
export const StoredCartSchema = cartOf(StoredCartLineSchema);

export type Product = z.infer<typeof ProductSchema>;
export type AddedCart = z.infer<typeof AddedCartSchema>;
export type StoredCart = z.infer<typeof StoredCartSchema>;
