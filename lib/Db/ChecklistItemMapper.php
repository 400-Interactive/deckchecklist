<?php

declare(strict_types=1);

namespace OCA\DeckChecklist\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/** @template-extends QBMapper<ChecklistItem> */
class ChecklistItemMapper extends QBMapper {
	public function __construct(IDBConnection $db) {
		parent::__construct($db, 'deckcl_items', ChecklistItem::class);
	}

	public function find(int $id): ChecklistItem {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		/** @var ChecklistItem $item */
		$item = $this->findEntity($qb);
		return $item;
	}

	/**
	 * @return ChecklistItem[]
	 */
	public function findByList(int $listId): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->eq('list_id', $qb->createNamedParameter($listId, IQueryBuilder::PARAM_INT)))
			->orderBy('sort_order', 'ASC')
			->addOrderBy('id', 'ASC');
		return $this->findEntities($qb);
	}

	public function deleteByList(int $listId): void {
		$qb = $this->db->getQueryBuilder();
		$qb->delete($this->getTableName())
			->where($qb->expr()->eq('list_id', $qb->createNamedParameter($listId, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
	}
}
