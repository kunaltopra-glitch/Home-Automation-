import { useMutation } from "@tanstack/react-query";
import { useActor } from "./useActor";

export function useUpdateBlynkPin() {
  const { actor } = useActor();

  return useMutation({
    mutationFn: async ({ pin, value }: { pin: string; value: string }) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.updateBlynkPin(pin, value);
    },
  });
}
