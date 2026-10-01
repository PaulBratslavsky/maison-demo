import { connection } from 'next/server';

import { HomeScreen } from '@/components/home-screen';
import { readHomePage } from '@/lib/home-page';

/**
 * Home. Its words are the Home page single type in Strapi, as published, read on the server for every request:
 * connection() keeps Next from rendering it once at build time, so a published edit shows on the next load. Strapi down,
 * or a required field blank, and that language shows the built-in text (lib/home-page.ts). Both languages go to the
 * client screen, so the language switch stays instant.
 */
export default async function Home() {
  await connection();
  return <HomeScreen text={await readHomePage()} />;
}
