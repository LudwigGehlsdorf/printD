import type { ReactNode } from "react";
import { signIn, signOut } from "@/auth";
import { DsekLogo } from "@/components/dsek-logo";
import { JobsProvider, PrinterStatus } from "@/components/jobs/jobs-context";
import { PrintApp } from "@/components/print/print-app";
import { buttonClass } from "@/components/ui";
import { config } from "@/lib/config";
import { ACCEPTED_EXTENSIONS } from "@/lib/convert";
import { getViewer, type User } from "@/lib/session";

export default async function Home() {
  const viewer = await getViewer();

  if (viewer.status === "allowed") {
    return (
      <JobsProvider>
        <Header user={viewer.user} status={<PrinterStatus />} />
        {config.printMode === "dry-run" && (
          <div className="border-b bg-amber-50 px-4 py-2 text-center text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Testläge: inget skickas till skrivaren.
            <span className="hidden sm:inline">
              {" "}
              PDF:erna sparas i <code>{config.dryRunDir}</code>.
            </span>
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 sm:py-10">
          <PrintApp
            accept={ACCEPTED_EXTENSIONS.join(",")}
            maxUploadMb={config.maxUploadBytes / 1024 / 1024}
            maxCopies={config.maxCopies}
            securePrint={config.securePrint}
          />
        </main>
      </JobsProvider>
    );
  }

  return (
    <>
      <Header user={viewer.status === "forbidden" ? viewer.user : null} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-8 sm:py-12">
        <div className="max-w-prose">
          {viewer.status === "anonymous" ? (
            <>
              <h1>Skriv ut</h1>
              <p className="mt-2 text-muted-foreground">
                Skriv ut dokument på D-sektionens skrivare. Logga in med ditt D-sektionen-konto för att fortsätta.
              </p>
              <form
                action={async () => {
                  "use server";
                  await signIn("authentik");
                }}
              >
                <button className={buttonClass({ size: "lg" }, "mt-6")}>Logga in</button>
              </form>
            </>
          ) : (
            <>
              <h1>Ingen åtkomst</h1>
              <p className="mt-2 text-muted-foreground">
                Du är inloggad som {viewer.user.name}, men ditt konto har inte behörighet att skriva ut.
              </p>
              <details className="mt-6 text-muted-foreground">
                <summary className="cursor-pointer">Detaljer</summary>
                <p className="mt-2">
                  Tillåtna grupper: <code className="text-foreground">{config.allowedGroups.join(", ")}</code>
                </p>
                <p>
                  Dina grupper: <code className="text-foreground">{viewer.groups.join(", ") || "inga"}</code>
                </p>
              </details>
            </>
          )}
        </div>
      </main>
    </>
  );
}

function Header({ user, status }: { user: User | null; status?: ReactNode }) {
  return (
    <header className="border-b bg-muted-background">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
        <div className="flex items-center gap-4">
          <a href="https://dsek.se" aria-label="Till dsek.se" className="text-rosa-400">
            <DsekLogo className="size-6" />
          </a>
          <span className="font-medium">
            print<span className="text-rosa-400">D</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          {status}
          {user && (
            <>
              {status && <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />}
              <span className="hidden text-muted-foreground md:inline">{user.name}</span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button className={buttonClass({ variant: "ghost", size: "sm" }, "-mr-3")}>Logga ut</button>
              </form>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
