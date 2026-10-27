"""Pricing for individually selected print pages."""


def summarize(jobs, bw_price, color_price):
    if bw_price < 0 or color_price < 0:
        raise ValueError('Harga tidak boleh negatif')
    bw_pages = color_pages = 0
    for job in jobs:
        copies = job['copies']
        if not isinstance(copies, int) or isinstance(copies, bool) or copies < 1:
            raise ValueError('Jumlah salinan harus minimal 1')
        if job['color']:
            color_pages += copies
        else:
            bw_pages += copies
    return {'bw_pages': bw_pages, 'color_pages': color_pages,
            'total': bw_pages * bw_price + color_pages * color_price}
