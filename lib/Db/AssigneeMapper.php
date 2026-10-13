<?php

declare(strict_types=1);

namespace OCA\DeckChecklist\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/** @template-extends QBMapper<Assignee> */
class AssigneeMapper extends QBMapper {
	public function __construct(IDBConnection $db) {
		parent::__construct($db, 'deckcl_assignees', Assignee::class);
	}

	/**
	 * @param list<int> $itemIds
	 * @return Assignee[]
	 */
	public function findByItems(array $itemIds): array {
		if ($itemIds === []) {
			return [];
		}
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->in('item_id', $qb->createNamedParameter($itemIds, IQueryBuilder::PARAM_INT_ARRAY)))
			->orderBy('id', 'ASC');
		return $this->findEntities($qb);
	}

	/**
	 * @param list<int> $itemIds
	 */
	public function deleteByItemIds(array $itemIds): void {
		if ($itemIds === []) {
			return;
		}
		$qb = $this->db->getQueryBuilder();
		$qb->delete($this->getTableName())
			->where($qb->expr()->in('item_id', $qb->createNamedParameter($itemIds, IQueryBuilder::PARAM_INT_ARRAY)));
		$qb->executeStatement();
	}
}
