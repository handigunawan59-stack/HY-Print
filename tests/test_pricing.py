from pricing import summarize
import pytest


def test_totals_count_each_page_and_its_copies():
    jobs = [{'page': 1, 'color': False, 'copies': 3}, {'page': 2, 'color': True, 'copies': 2}]
    assert summarize(jobs, 500, 1500) == {'bw_pages': 3, 'color_pages': 2, 'total': 4500}


def test_empty_selection_costs_nothing():
    assert summarize([], 500, 1000) == {'bw_pages': 0, 'color_pages': 0, 'total': 0}


def test_invalid_copies_are_rejected():
    with pytest.raises(ValueError):
        summarize([{'page': 1, 'color': True, 'copies': 0}], 500, 1000)


def test_negative_prices_are_rejected():
    with pytest.raises(ValueError):
        summarize([], -1, 1000)
