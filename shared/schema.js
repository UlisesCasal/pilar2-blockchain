'use strict';

const VALID_TYPES = ['MINERAL', 'CRUDO'];

const REQUIRED_FIELDS = [
  'id',
  'id_lote',
  'origen',
  'destino',
  'cantidad',
  'tipo',
  'timestamp',
  'firma',
];

module.exports = { VALID_TYPES, REQUIRED_FIELDS };
