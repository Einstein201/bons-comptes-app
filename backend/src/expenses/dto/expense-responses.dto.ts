import { ApiProperty } from '@nestjs/swagger';

export class ExpensePayerDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Alice Martin' })
  name: string;
}

export class ExpenseResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Billets de train' })
  title: string;

  @ApiProperty({
    type: 'integer',
    description: 'Montant en centimes.',
    example: 4599,
  })
  amount: number;

  @ApiProperty({ format: 'date', example: '2026-10-25' })
  date: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: ExpensePayerDto })
  paidBy: ExpensePayerDto;
}

export class ExpensePageDto {
  @ApiProperty({ type: [ExpenseResponseDto] })
  items: ExpenseResponseDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;

  @ApiProperty({
    type: 'integer',
    description: 'Total de toutes les dépenses du porte-monnaie, en centimes.',
    example: 31112,
  })
  totalAmount: number;
}
