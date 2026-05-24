/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query ProductDetail($id: UUID!) {\n    product(id: $id) {\n      id slug title description price compareAtPrice imageUrl stockStatus inventoryCount category tags\n    }\n  }\n": typeof types.ProductDetailDocument,
    "\n  query CatalogueProducts($first: Int, $after: String, $category: String, $search: String) {\n    products(first: $first, after: $after, category: $category, search: $search) {\n      edges {\n        cursor\n        node { id slug title price compareAtPrice imageUrl stockStatus inventoryCount category }\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n": typeof types.CatalogueProductsDocument,
    "\n  mutation createOrder($input: CreateOrderInput!) {\n    createOrder(input: $input) { id status total createdAt }\n  }\n": typeof types.CreateOrderDocument,
    "\n  mutation processPayment($input: ProcessPaymentInput!) {\n    processPayment(input: $input) { id status amount currency processedAt }\n  }\n": typeof types.ProcessPaymentDocument,
    "\n  query MyOrders {\n    myOrders(first: 20) {\n      edges {\n        node { id status total createdAt items { productTitle quantity } }\n      }\n    }\n  }\n": typeof types.MyOrdersDocument,
    "\n  query HomePageData {\n    featuredProducts(limit: 3) {\n      id slug title price compareAtPrice imageUrl stockStatus inventoryCount category\n    }\n    featuredPosts(limit: 2) {\n      id slug title excerpt imageUrl category publishedAt author\n    }\n  }\n": typeof types.HomePageDataDocument,
    "\n  mutation sendAIMessage($input: SendAIMessageInput!) {\n    sendAIMessage(input: $input) {\n      message { id role content createdAt }\n      conversation { id }\n    }\n  }\n": typeof types.SendAiMessageDocument,
    "\n  mutation signIn($input: SignInInput!) {\n    signIn(input: $input) {\n      token\n      user { id email name avatarUrl createdAt }\n    }\n  }\n": typeof types.SignInDocument,
    "\n  mutation signUp($input: SignUpInput!) {\n    signUp(input: $input) {\n      token\n      user { id email name avatarUrl createdAt }\n    }\n  }\n": typeof types.SignUpDocument,
    "\n  mutation signOut {\n    signOut\n  }\n": typeof types.SignOutDocument,
};
const documents: Documents = {
    "\n  query ProductDetail($id: UUID!) {\n    product(id: $id) {\n      id slug title description price compareAtPrice imageUrl stockStatus inventoryCount category tags\n    }\n  }\n": types.ProductDetailDocument,
    "\n  query CatalogueProducts($first: Int, $after: String, $category: String, $search: String) {\n    products(first: $first, after: $after, category: $category, search: $search) {\n      edges {\n        cursor\n        node { id slug title price compareAtPrice imageUrl stockStatus inventoryCount category }\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n": types.CatalogueProductsDocument,
    "\n  mutation createOrder($input: CreateOrderInput!) {\n    createOrder(input: $input) { id status total createdAt }\n  }\n": types.CreateOrderDocument,
    "\n  mutation processPayment($input: ProcessPaymentInput!) {\n    processPayment(input: $input) { id status amount currency processedAt }\n  }\n": types.ProcessPaymentDocument,
    "\n  query MyOrders {\n    myOrders(first: 20) {\n      edges {\n        node { id status total createdAt items { productTitle quantity } }\n      }\n    }\n  }\n": types.MyOrdersDocument,
    "\n  query HomePageData {\n    featuredProducts(limit: 3) {\n      id slug title price compareAtPrice imageUrl stockStatus inventoryCount category\n    }\n    featuredPosts(limit: 2) {\n      id slug title excerpt imageUrl category publishedAt author\n    }\n  }\n": types.HomePageDataDocument,
    "\n  mutation sendAIMessage($input: SendAIMessageInput!) {\n    sendAIMessage(input: $input) {\n      message { id role content createdAt }\n      conversation { id }\n    }\n  }\n": types.SendAiMessageDocument,
    "\n  mutation signIn($input: SignInInput!) {\n    signIn(input: $input) {\n      token\n      user { id email name avatarUrl createdAt }\n    }\n  }\n": types.SignInDocument,
    "\n  mutation signUp($input: SignUpInput!) {\n    signUp(input: $input) {\n      token\n      user { id email name avatarUrl createdAt }\n    }\n  }\n": types.SignUpDocument,
    "\n  mutation signOut {\n    signOut\n  }\n": types.SignOutDocument,
};

/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = gql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function gql(source: string): unknown;

/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query ProductDetail($id: UUID!) {\n    product(id: $id) {\n      id slug title description price compareAtPrice imageUrl stockStatus inventoryCount category tags\n    }\n  }\n"): (typeof documents)["\n  query ProductDetail($id: UUID!) {\n    product(id: $id) {\n      id slug title description price compareAtPrice imageUrl stockStatus inventoryCount category tags\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query CatalogueProducts($first: Int, $after: String, $category: String, $search: String) {\n    products(first: $first, after: $after, category: $category, search: $search) {\n      edges {\n        cursor\n        node { id slug title price compareAtPrice imageUrl stockStatus inventoryCount category }\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query CatalogueProducts($first: Int, $after: String, $category: String, $search: String) {\n    products(first: $first, after: $after, category: $category, search: $search) {\n      edges {\n        cursor\n        node { id slug title price compareAtPrice imageUrl stockStatus inventoryCount category }\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation createOrder($input: CreateOrderInput!) {\n    createOrder(input: $input) { id status total createdAt }\n  }\n"): (typeof documents)["\n  mutation createOrder($input: CreateOrderInput!) {\n    createOrder(input: $input) { id status total createdAt }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation processPayment($input: ProcessPaymentInput!) {\n    processPayment(input: $input) { id status amount currency processedAt }\n  }\n"): (typeof documents)["\n  mutation processPayment($input: ProcessPaymentInput!) {\n    processPayment(input: $input) { id status amount currency processedAt }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query MyOrders {\n    myOrders(first: 20) {\n      edges {\n        node { id status total createdAt items { productTitle quantity } }\n      }\n    }\n  }\n"): (typeof documents)["\n  query MyOrders {\n    myOrders(first: 20) {\n      edges {\n        node { id status total createdAt items { productTitle quantity } }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query HomePageData {\n    featuredProducts(limit: 3) {\n      id slug title price compareAtPrice imageUrl stockStatus inventoryCount category\n    }\n    featuredPosts(limit: 2) {\n      id slug title excerpt imageUrl category publishedAt author\n    }\n  }\n"): (typeof documents)["\n  query HomePageData {\n    featuredProducts(limit: 3) {\n      id slug title price compareAtPrice imageUrl stockStatus inventoryCount category\n    }\n    featuredPosts(limit: 2) {\n      id slug title excerpt imageUrl category publishedAt author\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation sendAIMessage($input: SendAIMessageInput!) {\n    sendAIMessage(input: $input) {\n      message { id role content createdAt }\n      conversation { id }\n    }\n  }\n"): (typeof documents)["\n  mutation sendAIMessage($input: SendAIMessageInput!) {\n    sendAIMessage(input: $input) {\n      message { id role content createdAt }\n      conversation { id }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation signIn($input: SignInInput!) {\n    signIn(input: $input) {\n      token\n      user { id email name avatarUrl createdAt }\n    }\n  }\n"): (typeof documents)["\n  mutation signIn($input: SignInInput!) {\n    signIn(input: $input) {\n      token\n      user { id email name avatarUrl createdAt }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation signUp($input: SignUpInput!) {\n    signUp(input: $input) {\n      token\n      user { id email name avatarUrl createdAt }\n    }\n  }\n"): (typeof documents)["\n  mutation signUp($input: SignUpInput!) {\n    signUp(input: $input) {\n      token\n      user { id email name avatarUrl createdAt }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation signOut {\n    signOut\n  }\n"): (typeof documents)["\n  mutation signOut {\n    signOut\n  }\n"];

export function gql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;