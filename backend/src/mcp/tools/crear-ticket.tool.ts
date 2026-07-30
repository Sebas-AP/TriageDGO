import type { NuevoTicket, Ticket, TicketsRepository } from "../../data/firestore/tickets.repo";

export class CrearTicketTool { constructor(private readonly tickets: TicketsRepository) {} ejecutar(input: NuevoTicket): Promise<Ticket> { return this.tickets.crear(input); } }
