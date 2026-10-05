'use client';
import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
export interface OpcionComponente {
  id: string;
  nombre: string;
  tipo: 'insumo' | 'subreceta';
  unidad: string;
  costo: number;
  activo: boolean;
}
export function SelectorComponente({
  opciones,
  value,
  onChange,
  disabled,
}: {
  opciones: OpcionComponente[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const actual = opciones.find((o) => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label="Componente"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between"
        >
          {actual
            ? `${actual.nombre}${actual.activo ? '' : ' (inactivo)'}`
            : 'Elegir ingrediente o sub-receta'}
          <ChevronsUpDown className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] max-w-[90vw] p-0">
        <Command label="Ingredientes y sub-recetas">
          <CommandInput
            aria-label="Buscar ingrediente o sub-receta"
            placeholder="Buscar ingrediente o sub-receta…"
          />
          <CommandList aria-label="Ingredientes y sub-recetas">
            <CommandEmpty>No hay coincidencias.</CommandEmpty>
            <CommandGroup>
              {opciones
                .filter((o) => o.activo)
                .map((o) => (
                  <CommandItem
                    key={o.id}
                    value={`${o.nombre} ${o.tipo}`}
                    onSelect={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={value === o.id ? 'opacity-100' : 'opacity-0'} />
                    {o.nombre}
                    <span className="ml-auto text-xs">
                      {o.tipo} · {o.unidad}
                    </span>
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
