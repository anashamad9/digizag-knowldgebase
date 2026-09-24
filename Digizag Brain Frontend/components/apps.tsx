import Image from "next/image";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableRow, TableCell } from "./ui/table";
import { Icon } from "./icon";
import type { BrainState } from "@/hooks/use-brain";
export function Apps({ brain: b }: { brain: BrainState }) {
  return (
    <section
      aria-label="Connected apps"
      className="mx-auto w-full max-w-3xl p-4 sm:p-6"
    >
      <Table>
        <TableBody>
          {(["gmail", "pumble"] as const).map((provider) => {
            const c = b.connections.find((c) => c.provider === provider);
            const loading = b.connectionBusy === provider;
            const partial = c?.error?.startsWith("Skipped ");
            const connected = c?.status === "ACTIVE";
            return (
              <TableRow key={provider}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Image
                      src={`/logos/${provider === "gmail" ? "gmail.png" : "pumble.svg"}`}
                      loading="eager"
                      width={20}
                      height={20}
                      alt=""
                    />
                    {provider === "gmail" ? "Gmail" : "Pumble"}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      partial
                        ? "warning"
                        : c?.error
                          ? "error"
                          : connected
                            ? "success"
                            : "warning"
                    }
                  >
                    {partial
                      ? "Partial sync"
                      : c?.error
                        ? "Sync error"
                        : connected
                          ? "Connected"
                          : "Not connected"}
                  </Badge>
                  {c?.error && (
                    <p className="mt-2 max-w-xs whitespace-normal text-xs text-muted-foreground">
                      {c.error}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={!!b.connectionBusy}
                      loading={loading}
                      onClick={() =>
                        connected ? void b.sync(c) : void b.connect(provider)
                      }
                    >
                      {loading && b.syncCount !== null
                        ? `Syncing ${b.syncCount}…`
                        : connected
                          ? "Sync"
                          : "Connect"}
                    </Button>
                    {loading && b.syncCount !== null && (
                      <Button size="xs" variant="ghost" onClick={b.stopSync}>
                        Stop
                      </Button>
                    )}
                    {c && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="text-destructive-foreground"
                        disabled={!!b.connectionBusy}
                        aria-label={`Disconnect ${provider}`}
                        title="Disconnect"
                        onClick={() =>
                          b.setPendingDelete({
                            kind: "connection",
                            id: c.id,
                            title: provider,
                          })
                        }
                      >
                        <Icon name="close" size={13} />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
