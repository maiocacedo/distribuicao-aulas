import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * A tabela das telas antigas (`table.lista`), nos mesmos números: cabeçalho de
 * 10 px em caixa alta, linha de 38 px, fio entre as linhas e realce no pouso.
 * O painel em volta (fundo, raio e contorno) não mora aqui: quem desenha uma
 * lista inteira usa `TabelaDados`, que o acrescenta; um quadro pequeno dentro
 * de uma seção usa estas peças direto e fica sem moldura, como era.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-base", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead data-slot="table-header" className={cn(className)} {...props} />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-line bg-poco font-semibold [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        // O realce é só das linhas do corpo: o cabeçalho não é clicável inteiro.
        "border-b border-line transition-colors duration-90 [tbody>&]:hover:bg-accent",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "px-2.5 py-2 text-left align-middle text-[10px] font-semibold tracking-[0.06em] whitespace-nowrap text-tx3 uppercase",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("h-[38px] px-2.5 align-middle", className)}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-3 text-xs text-tx3", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
