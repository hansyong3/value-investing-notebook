import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username as string;
        const password = credentials?.password as string;

        if (
          username !== process.env.ADMIN_USERNAME ||
          !password
        ) return null;

        // Support both plain text (for easy setup) and bcrypt hashed passwords
        const storedPassword = process.env.ADMIN_PASSWORD!;
        const isValid = storedPassword.startsWith("$2")
          ? await bcrypt.compare(password, storedPassword)
          : password === storedPassword;

        if (!isValid) return null;

        return { id: "1", name: username, email: `${username}@local` };
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
});
