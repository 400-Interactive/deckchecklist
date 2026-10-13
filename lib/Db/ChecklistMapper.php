<?php

declare(strict_types=1);

namespace OCA\DeckChecklist\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/** @template-extends QBMapper<Checklist> */
class ChecklistMapper extends QBMapper {
	public function __construct(IDBConnection $db) {
		parent::__construct($db, 'deckcl_lists', Checklist::class);
	}

	public function find(int $id): Checklist {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		/** @var Checklist $list */
		$list = $this->findEntity($qb);
		return $list;
	}

	/**
	 * @return Checklist[]
	 */
	public function findByCard(int $cardId): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->eq('card_id', $qb->createNamedParameter($cardId, IQueryBuilder::PARAM_INT)))
			->orderBy('sort_order', 'ASC')
			->addOrderBy('id', 'ASC');
		return $this->findEntities($qb);
	}
}
