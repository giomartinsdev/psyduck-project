import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { gql } from '@apollo/client';
import styles from './PostCard.module.css';

export const PostCardFragment = gql`
  fragment PostCard on Post {
    id
    slug
    title
    excerpt
    imageUrl
    category
    publishedAt
    author
  }
`;

export interface PostCardData {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  imageUrl: string;
  category: string;
  publishedAt: string;
  author: string;
}

export function PostCard({ post }: { post: PostCardData }) {
  const date = new Date(post.publishedAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <article className={`glass-card ${styles.card}`}>
      <Link href={`/posts/${post.id}`} className={styles.imageLink}>
        <div className={styles.imageWrapper}>
          <Image src={post.imageUrl} alt={post.title} fill sizes="(max-width: 768px) 100vw, 340px" className={styles.image} unoptimized />
          <span className={styles.category}>{post.category}</span>
        </div>
      </Link>
      <div className={styles.body}>
        <Link href={`/posts/${post.id}`}>
          <h3 className={styles.title}>{post.title}</h3>
        </Link>
        <p className={styles.excerpt}>{post.excerpt}</p>
        <div className={styles.meta}>
          <span>{post.author}</span>
          <span>·</span>
          <time dateTime={post.publishedAt}>{date}</time>
        </div>
      </div>
    </article>
  );
}
