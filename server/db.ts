import { PrismaClient } from "@prisma/client";

const prismaInstance = global.prisma || new PrismaClient();

export const db = prismaInstance.$extends({
  query: {
    auditEvent: {
      async update({ args, query }) {
        if (process.env.NODE_ENV === "test") {
          return query(args);
        }
        throw new Error("Updates to AuditEvent are blocked by append-only policy.");
      },
      async updateMany({ args, query }) {
        if (process.env.NODE_ENV === "test") {
          return query(args);
        }
        throw new Error("Updates to AuditEvent are blocked by append-only policy.");
      },
      async delete({ args, query }) {
        if (process.env.NODE_ENV === "test") {
          return query(args);
        }
        throw new Error("Deletions of AuditEvent are blocked by append-only policy.");
      },
      async deleteMany({ args, query }) {
        if (process.env.NODE_ENV === "test") {
          return query(args);
        }
        throw new Error("Deletions of AuditEvent are blocked by append-only policy.");
      },
      async upsert({ args, query }) {
        if (process.env.NODE_ENV === "test") {
          return query(args);
        }
        throw new Error("Upsert on AuditEvent is blocked by append-only policy.");
      }
    }
  }
});

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

if (process.env.NODE_ENV !== "production") {
  global.prisma = prismaInstance;
}
